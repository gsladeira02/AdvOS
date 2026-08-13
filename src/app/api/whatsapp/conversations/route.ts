import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { clientIdFromVirtualConversationId, isVirtualConversationId, mergeClientContactsIntoConversations, virtualConversationId } from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

async function getClientForVirtual(admin: any, lawFirmId: string, virtualId: string) {
  const clientId = clientIdFromVirtualConversationId(virtualId);
  if (!clientId) return null;

  const { data } = await admin
    .from('clients')
    .select('id,law_firm_id,name,phone,whatsapp,created_at')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();

  return data;
}

function virtualContactFromClient(client: any) {
  const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
  if (!client?.id || !phone) return null;
  return {
    id: virtualConversationId(client.id),
    law_firm_id: client.law_firm_id,
    client_id: client.id,
    phone,
    lead_name: client.name || phone,
    status: 'contato',
    last_message_at: null,
    unread_count: 0,
    updated_at: client.created_at || null,
    virtual: true,
    clients: { id: client.id, name: client.name, whatsapp: client.whatsapp, phone: client.phone },
  };
}

function hasRealMessageActivity(conversation: any) {
  return Boolean(conversation?.last_message_at || Number(conversation?.unread_count || 0) > 0);
}

export async function GET(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const url = new URL(req.url);
    const requestedId = url.searchParams.get('conversationId') || '';
    const search = String(url.searchParams.get('q') || '').trim();

    const requestedIsVirtual = isVirtualConversationId(requestedId);

    const { data: existingConversations, error: conversationError } = await admin
      .from('whatsapp_conversations')
      .select('*, clients(id,name,whatsapp,phone)')
      .eq('law_firm_id', profile.law_firm_id)
      .order('last_message_at', { ascending: false })
      .limit(500);

    if (conversationError) throw new Error(conversationError.message);

    // A aba Conversas deve mostrar somente conversas reais, com mensagens.
    // Clientes cadastrados entram como Contatos apenas quando o usuário pesquisa ou abre pelo botão do cliente.
    let conversations = (existingConversations || []).filter(hasRealMessageActivity);

    let clientContacts: any[] = [];
    if (search) {
      const { data: rawClientContacts, error: clientsError } = await admin
        .from('clients')
        .select('id,law_firm_id,name,phone,whatsapp,created_at')
        .eq('law_firm_id', profile.law_firm_id)
        .order('name');

      if (clientsError) throw new Error(clientsError.message);
      clientContacts = (rawClientContacts || []).filter((client: any) => normalizeBrazilPhone(client?.whatsapp || client?.phone || ''));
      conversations = mergeClientContactsIntoConversations(conversations, clientContacts);
    }

    if (requestedIsVirtual && !conversations.some((item: any) => item.id === requestedId)) {
      const client = await getClientForVirtual(admin, profile.law_firm_id, requestedId);
      const virtual = virtualContactFromClient(client);
      if (virtual) conversations = [virtual, ...conversations];
    }

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

    let selected = conversations.find((item: any) => item.id === requestedId) || null;

    if (!selected && requestedId && !requestedIsVirtual) {
      const { data: requestedConversation } = await admin
        .from('whatsapp_conversations')
        .select('*, clients(id,name,whatsapp,phone)')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', requestedId)
        .maybeSingle();
      selected = requestedConversation || null;
      if (selected && !conversations.some((item: any) => item.id === selected.id) && hasRealMessageActivity(selected)) {
        conversations = [selected, ...conversations];
      }
    }

    if (!selected && !requestedId && !search) selected = conversations?.[0] || null;

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
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar conversas.' }, { status: 400 });
  }
}
