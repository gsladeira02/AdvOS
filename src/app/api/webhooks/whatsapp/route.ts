import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { firstTextFromInboundMessage, getOrCreateConversation } from '@/lib/whatsappApi';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('Webhook inválido', { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data } = await admin
    .from('integration_settings')
    .select('id')
    .eq('provider', 'whatsapp')
    .eq('webhook_secret', token)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (!data) return new NextResponse('Token inválido', { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

function findFirmByPhoneNumberId(rows: any[] | null, phoneNumberId?: string | null) {
  if (!phoneNumberId) return null;
  return (rows || []).find((row) => row?.raw_settings?.phone_number_id === phoneNumberId) || null;
}

async function matchClient(lawFirmId: string, phone: string) {
  const admin = createAdminSupabase();
  const normalized = normalizeBrazilPhone(phone);
  const { data: clients } = await admin
    .from('clients')
    .select('id,name,phone,whatsapp')
    .eq('law_firm_id', lawFirmId);

  return (clients || []).find((client: any) => {
    return normalizeBrazilPhone(client.whatsapp) === normalized || normalizeBrazilPhone(client.phone) === normalized;
  }) || null;
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const admin = createAdminSupabase();

  const { data: integrations } = await admin
    .from('integration_settings')
    .select('law_firm_id,provider,enabled,raw_settings')
    .eq('provider', 'whatsapp')
    .eq('enabled', true);

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id;
      const firmIntegration = findFirmByPhoneNumberId(integrations || [], phoneNumberId);
      if (!firmIntegration?.law_firm_id) continue;

      const lawFirmId = firmIntegration.law_firm_id;
      const eventId = entry?.id || value?.messages?.[0]?.id || value?.statuses?.[0]?.id || null;

      await admin.from('webhook_events').insert({
        law_firm_id: lawFirmId,
        provider: 'whatsapp',
        event_id: eventId,
        event_type: change?.field || 'messages',
        payload,
        processed_at: new Date().toISOString(),
      });

      for (const message of value?.messages || []) {
        const phone = normalizeBrazilPhone(message.from);
        const contact = (value?.contacts || []).find((c: any) => normalizeBrazilPhone(c.wa_id) === phone);
        const client = await matchClient(lawFirmId, phone);
        const conversation = await getOrCreateConversation({
          lawFirmId,
          clientId: client?.id || null,
          phone,
          leadName: client?.name || contact?.profile?.name || null,
        });

        const inboundMedia = message?.image || message?.document || message?.video || message?.audio || null;

        await admin.from('whatsapp_messages').upsert({
          law_firm_id: lawFirmId,
          conversation_id: conversation.id,
          client_id: client?.id || null,
          direction: 'inbound',
          message_type: message.type || 'text',
          body: firstTextFromInboundMessage(message),
          external_id: message.id,
          status: 'received',
          raw_payload: message,
          file_name: inboundMedia?.filename || null,
          mime_type: inboundMedia?.mime_type || null,
          media_url: inboundMedia?.id || null,
          created_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        }, { onConflict: 'external_id' });

        await admin
          .from('whatsapp_conversations')
          .update({
            client_id: client?.id || conversation.client_id || null,
            lead_name: client?.name || contact?.profile?.name || conversation.lead_name || null,
            last_message_at: new Date().toISOString(),
            unread_count: Number(conversation.unread_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id)
          .eq('law_firm_id', lawFirmId);
      }

      for (const status of value?.statuses || []) {
        const updates: any = { status: status.status || 'status', raw_payload: status };
        if (status.status === 'delivered') updates.delivered_at = new Date(Number(status.timestamp || Date.now() / 1000) * 1000).toISOString();
        if (status.status === 'read') updates.read_at = new Date(Number(status.timestamp || Date.now() / 1000) * 1000).toISOString();
        const statusError = status.errors?.[0];
        if (statusError) {
          updates.error_message = statusError.error_data?.details || statusError.message || statusError.title || `Erro ${statusError.code || ''}`.trim();
        }

        await admin
          .from('whatsapp_messages')
          .update(updates)
          .eq('law_firm_id', lawFirmId)
          .eq('external_id', status.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
