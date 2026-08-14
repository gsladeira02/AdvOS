import { NextResponse } from 'next/server';
import { publicErrorMessage } from '@/lib/security';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  buildClientContacts,
  clientIdFromVirtualConversationId,
  isVirtualConversationId,
  virtualContactFromClient,
  loadVisibleConversations,
  enrichMessagesWithSenderProfiles,
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

    const clients = await getClientsWithPhone(admin, profile.law_firm_id);

    // A fonte de verdade da aba Conversas são as mensagens visíveis.
    // Não dependemos de last_message_at para decidir se uma conversa existe na lista.
    let conversations = await loadVisibleConversations(admin, profile.law_firm_id, 500);
    let contacts = buildClientContacts(conversations || [], clients || []);

    if (search) {
      conversations = conversations.filter((conversation: any) => matchesSearch(conversation, search));
      contacts = contacts.filter((contact: any) => matchesSearch(contact, search));
    }

    let selected = conversations.find((item: any) => item.id === requestedId) || null;
    if (!selected) selected = contacts.find((item: any) => item.id === requestedId || item.conversation_id === requestedId) || null;

    if (!selected && requestedIsVirtual) {
      const virtual = await getClientForVirtual(admin, profile.law_firm_id, requestedId, conversations || []);
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
        if (!conversations.some((item: any) => item.id === requestedConversation.id)) {
          const visibleForRequested = await loadVisibleConversations(admin, profile.law_firm_id, 500);
          const activeRequested = visibleForRequested.find((item: any) => item.id === requestedConversation.id);
          if (activeRequested) conversations = [activeRequested, ...conversations];
        }
      }
    }

    // Sem conversationId explícito, nenhuma conversa é aberta automaticamente.
    // Isso evita marcar mensagens como lidas sem o usuário realmente abrir a conversa.

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
      messages = await enrichMessagesWithSenderProfiles(admin, profile.law_firm_id, data || []);

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
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Erro ao carregar conversas.') }, { status: 400 });
  }
}
