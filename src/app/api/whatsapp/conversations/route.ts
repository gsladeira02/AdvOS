import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOrCreateConversation } from '@/lib/whatsappApi';
import { clientIdFromVirtualConversationId, isVirtualConversationId, mergeClientContactsIntoConversations, syncClientContactsToConversations } from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

async function getClientForVirtual(admin: any, lawFirmId: string, virtualId: string) {
  const clientId = clientIdFromVirtualConversationId(virtualId);
  if (!clientId) return null;

  const { data } = await admin
    .from('clients')
    .select('id,law_firm_id,name,phone,whatsapp,created_at,updated_at')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();

  return data;
}

export async function GET(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const url = new URL(req.url);
    const requestedId = url.searchParams.get('conversationId') || '';
    const search = String(url.searchParams.get('q') || '').trim();

    let concreteRequestedId = requestedId;

    if (isVirtualConversationId(requestedId)) {
      const client = await getClientForVirtual(admin, profile.law_firm_id, requestedId);
      const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
      if (client?.id && phone) {
        const created = await getOrCreateConversation({
          lawFirmId: profile.law_firm_id,
          clientId: client.id,
          phone,
          leadName: client.name,
        });
        concreteRequestedId = created.id;
      }
    }

    const { data: clientContacts, error: clientsError } = await admin
      .from('clients')
      .select('id,law_firm_id,name,phone,whatsapp,created_at,updated_at')
      .eq('law_firm_id', profile.law_firm_id)
      .or('phone.not.is.null,whatsapp.not.is.null')
      .order('name');

    if (clientsError) throw new Error(clientsError.message);

    await syncClientContactsToConversations(admin, profile.law_firm_id, clientContacts || []);

    const { data: existingConversations, error: conversationError } = await admin
      .from('whatsapp_conversations')
      .select('*, clients(id,name,whatsapp,phone)')
      .eq('law_firm_id', profile.law_firm_id)
      .order('last_message_at', { ascending: false })
      .limit(160);

    if (conversationError) throw new Error(conversationError.message);

    let conversations = mergeClientContactsIntoConversations(existingConversations || [], clientContacts || []);

    if (search) {
      const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      conversations = conversations.filter((conversation: any) => {
        const haystack = `${conversation?.clients?.name || ''} ${conversation?.lead_name || ''} ${conversation?.phone || ''}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return haystack.includes(term);
      });
    }

    const selected = conversations.find((item: any) => item.id === concreteRequestedId) || conversations?.[0] || null;
    let messages: any[] = [];

    if (selected?.id && !selected.virtual) {
      const { data, error } = await admin
        .from('whatsapp_messages')
        .select('*')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', selected.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      messages = data || [];

      if (Number(selected.unread_count || 0) > 0) {
        await admin
          .from('whatsapp_conversations')
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .eq('id', selected.id)
          .eq('law_firm_id', profile.law_firm_id);
      }
    }

    return NextResponse.json({
      ok: true,
      conversations,
      selectedId: selected?.id || '',
      messages,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar conversas.' }, { status: 400 });
  }
}
