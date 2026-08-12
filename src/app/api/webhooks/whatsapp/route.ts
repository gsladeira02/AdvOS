import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { firstTextFromInboundMessage, getOrCreateConversation, getWhatsAppConfig } from '@/lib/whatsappApi';
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

function digits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function findFirmByPhoneNumberId(rows: any[] | null, phoneNumberId?: string | null) {
  const target = digits(phoneNumberId);
  if (!target) return null;
  return (rows || []).find((row) => digits(row?.raw_settings?.phone_number_id) === target) || null;
}


function safeFileName(name: string) {
  return String(name || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'arquivo';
}

function extensionFromMime(mime?: string | null) {
  const clean = String(mime || '').toLowerCase();
  if (clean.includes('jpeg')) return 'jpg';
  if (clean.includes('png')) return 'png';
  if (clean.includes('webp')) return 'webp';
  if (clean.includes('pdf')) return 'pdf';
  if (clean.includes('mpeg')) return 'mp3';
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('mp4')) return 'mp4';
  return 'bin';
}

async function cacheInboundMedia(admin: any, lawFirmId: string, mediaNode: any, messageType: string) {
  const mediaId = String(mediaNode?.id || '').trim();
  if (!mediaId) return { mediaUrl: null, storagePath: null, mimeType: mediaNode?.mime_type || null, fileSize: null, fileName: mediaNode?.filename || null };

  try {
    const config = await getWhatsAppConfig(lawFirmId);
    if (!config.configured) throw new Error('WhatsApp API não configurado.');

    const metaResponse = await fetch(`${config.baseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    const meta = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok || !meta?.url) throw new Error(meta?.error?.message || 'Meta não retornou URL da mídia.');

    const fileResponse = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    if (!fileResponse.ok) throw new Error('Falha ao baixar mídia recebida.');

    const mimeType = meta.mime_type || mediaNode?.mime_type || fileResponse.headers.get('content-type') || 'application/octet-stream';
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    const baseName = safeFileName(mediaNode?.filename || `${messageType}-${mediaId}.${extensionFromMime(mimeType)}`);
    const storagePath = `${lawFirmId}/whatsapp/inbound/${Date.now()}-${baseName}`;

    const upload = await admin.storage.from('documents').upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const signed = await admin.storage.from('documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    return {
      mediaUrl: signed.data?.signedUrl || null,
      storagePath,
      mimeType,
      fileSize: Number(meta.file_size || bytes.length || 0) || null,
      fileName: baseName,
    };
  } catch (error) {
    console.error('Erro ao cachear mídia recebida do WhatsApp:', error);
    return {
      mediaUrl: mediaId,
      storagePath: null,
      mimeType: mediaNode?.mime_type || null,
      fileSize: null,
      fileName: mediaNode?.filename || null,
    };
  }
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


async function saveInboundMessage(admin: any, payload: any) {
  const externalId = String(payload.external_id || '').trim();
  if (externalId) {
    const { data: existing, error: existingError } = await admin
      .from('whatsapp_messages')
      .select('id')
      .eq('law_firm_id', payload.law_firm_id)
      .eq('external_id', externalId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing?.id) {
      const { data, error } = await admin
        .from('whatsapp_messages')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('law_firm_id', payload.law_firm_id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
  }

  const { data, error } = await admin
    .from('whatsapp_messages')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
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

        if (message.type === 'reaction') {
          const targetId = message?.reaction?.message_id;
          const emoji = message?.reaction?.emoji || null;
          if (targetId) {
            await admin
              .from('whatsapp_messages')
              .update({
                client_reaction_emoji: emoji || null,
                client_reacted_at: emoji ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
              })
              .eq('law_firm_id', lawFirmId)
              .eq('external_id', targetId);
          }
          continue;
        }

        const inboundMedia = message?.image || message?.document || message?.video || message?.audio || message?.sticker || null;
        const cachedMedia = inboundMedia ? await cacheInboundMedia(admin, lawFirmId, inboundMedia, message.type || 'media') : null;

        await saveInboundMessage(admin, {
          law_firm_id: lawFirmId,
          conversation_id: conversation.id,
          client_id: client?.id || null,
          direction: 'inbound',
          message_type: message.type || 'text',
          body: firstTextFromInboundMessage(message),
          external_id: message.id,
          status: 'received',
          raw_payload: message,
          file_name: cachedMedia?.fileName || inboundMedia?.filename || null,
          file_size: cachedMedia?.fileSize || null,
          mime_type: cachedMedia?.mimeType || inboundMedia?.mime_type || null,
          media_url: cachedMedia?.mediaUrl || inboundMedia?.id || null,
          storage_path: cachedMedia?.storagePath || null,
          created_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        });

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
