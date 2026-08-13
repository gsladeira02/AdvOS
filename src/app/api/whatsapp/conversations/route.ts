import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  buildClientContacts,
  clientIdFromVirtualConversationId,
  isVirtualConversationId,
  virtualContactFromClient,
} from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesSearch(item: any, search: string) {
  if (!search) return true;
  const term = normalizeSearch(search);
  const haystack = normalizeSearch(`${item?.clients?.name || ''} ${item?.lead_name || ''} ${item?.phone || ''} ${item?.clients?.phone || ''} ${item?.clients?.whatsapp || ''}`);
  return haystack.includes(term);
}

async function getConversationIdsWithVisibleMessages(admin: any, lawFirmId: string) {
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('conversation_id')
    .eq('law_firm_id', lawFirmId)
    .is('deleted_at', null)
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row: any) => String(row.conversation_id)).filter(Boolean));
}

async function getClientsWithPhone(admin: any, lawFirmId: string) {
  const { data, error } = await admin
    .from('clients')
    .select('id,law_firm_id,name,phone,whatsapp,created_at')
    .eq('law_firm_id', lawFirmId)
    .or('phone.not.is.null,whatsapp.not.is.null')
    .order('name');

  if (error) throw new Error(error.message);
  return (data || []).filter((client: any) => normalizeBrazilPhone(client?.whatsapp || client?.phone || ''));
}

async function getClientForVirtual(admin: any, lawFirmId: string, virtualId: string, conversations: any[] = []) {
  const clientId = clientIdFromVirtualConversationId(virtualId);
  if (!clientId) return null;

  const { data, error } = await admin
    .from('clients')
    .select('id,law_firm_id,name,phone,whatsapp,created_at')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return virtualContactFromClient(data, conversations);
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

    const clients = await getClientsWithPhone(admin, profile.law_firm_id);
    const conversationIdsWithMessages = await getConversationIdsWithVisibleMessages(admin, profile.law_firm_id);

    // Conversas = somente conversas que possuem pelo menos uma mensagem visível.
    // Contatos = clientes cadastrados com telefone/WhatsApp, separados da aba Conversas.
    // Isso também limpa a poluição causada por versões antigas que criavam conversas para todos os clientes.
    let conversations = (existingConversations || [])
      .filter((conversation: any) => conversationIdsWithMessages.has(String(conversation.id)))
      .map((conversation: any) => ({ ...conversation, has_messages: true, message_count: 1 }));
    let contacts = buildClientContacts(conversations || [], clients || []);

    if (search) {
      conversations = conversations.filter((conversation: any) => matchesSearch(conversation, search));
      contacts = contacts.filter((contact: any) => matchesSearch(contact, search));
    }

    let selected = conversations.find((item: any) => item.id === requestedId) || null;
    if (!selected) selected = contacts.find((item: any) => item.id === requestedId || item.conversation_id === requestedId) || null;

    if (!selected && requestedIsVirtual) {
      const virtual = await getClientForVirtual(admin, profile.law_firm_id, requestedId, existingConversations || []);
      if (virtual) {
        selected = virtual;
        if (!contacts.some((item: any) => item.id === virtual.id)) contacts = [virtual, ...contacts];
      }
    }

    if (!selected && requestedId && !requestedIsVirtual) {
      const { data: requestedConversation } = await admin
        .from('whatsapp_conversations')
        .select('*, clients(id,name,whatsapp,phone)')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', requestedId)
        .maybeSingle();
      if (requestedConversation) {
        selected = requestedConversation;
        if (conversationIdsWithMessages.has(String(requestedConversation.id)) && !conversations.some((item: any) => item.id === requestedConversation.id)) {
          conversations = [{ ...requestedConversation, has_messages: true, message_count: 1 }, ...conversations];
        }
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
      contacts,
      selectedId: selected?.id || '',
      selected,
      messages,
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar conversas.' }, { status: 400 });
  }
}
