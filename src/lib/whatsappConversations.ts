import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { getOrCreateConversation } from '@/lib/whatsappApi';

function titleForClient(client: any) {
  return client?.name || client?.whatsapp || client?.phone || 'Cliente';
}

export function virtualConversationId(clientId: string) {
  return `client:${clientId}`;
}

export function isVirtualConversationId(value?: string | null) {
  return String(value || '').startsWith('client:');
}

export function clientIdFromVirtualConversationId(value?: string | null) {
  const text = String(value || '');
  return text.startsWith('client:') ? text.slice('client:'.length) : '';
}

export function hasRealMessageActivity(conversation: any) {
  // V9.23: a aba Conversas deve mostrar apenas conversas que possuem mensagens visíveis.
  // last_message_at/unread_count podem ter sobrado de versões antigas que criavam conversas
  // para todos os clientes, então não podem mais ser usados como critério.
  return Boolean(
    conversation?.has_messages ||
    Number(conversation?.message_count || 0) > 0 ||
    Number(conversation?.visible_message_count || 0) > 0
  );
}

function conversationLookup(conversations: any[] = []) {
  const byClient = new Map<string, any>();
  const byPhone = new Map<string, any>();

  for (const conversation of conversations || []) {
    if (conversation?.client_id && !byClient.has(String(conversation.client_id))) {
      byClient.set(String(conversation.client_id), conversation);
    }
    const phone = normalizeBrazilPhone(conversation?.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, conversation);
  }

  return { byClient, byPhone };
}

export function virtualContactFromClient(client: any, conversations: any[] = []) {
  const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
  if (!client?.id || !phone) return null;

  const { byClient, byPhone } = conversationLookup(conversations || []);
  const existing = byClient.get(String(client.id)) || byPhone.get(phone) || null;

  return {
    id: existing?.id || virtualConversationId(client.id),
    contact_id: client.id,
    law_firm_id: client.law_firm_id,
    client_id: client.id,
    phone,
    lead_name: titleForClient(client),
    status: existing?.status || 'contato',
    last_message_at: existing?.last_message_at || null,
    unread_count: existing?.unread_count || 0,
    updated_at: existing?.updated_at || client.updated_at || client.created_at || null,
    virtual: !existing?.id,
    contact: true,
    has_conversation: Boolean(existing?.id && hasRealMessageActivity(existing)),
    conversation_id: existing?.id || null,
    clients: {
      id: client.id,
      name: client.name,
      whatsapp: client.whatsapp,
      phone: client.phone,
    },
  };
}

export function buildClientContacts(conversations: any[] = [], clients: any[] = []) {
  const seen = new Set<string>();
  return (clients || [])
    .map((client) => virtualContactFromClient(client, conversations))
    .filter(Boolean)
    .filter((contact: any) => {
      const key = String(contact?.client_id || contact?.phone || contact?.id || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a: any, b: any) => String(a?.clients?.name || a?.lead_name || '').localeCompare(String(b?.clients?.name || b?.lead_name || ''), 'pt-BR'));
}

export function mergeClientContactsIntoConversations(conversations: any[] = [], clients: any[] = []) {
  const contacts = buildClientContacts(conversations, clients)
    .filter((contact: any) => contact.virtual);
  return [...(conversations || []), ...contacts];
}

export async function syncClientContactsToConversations(admin: any, lawFirmId: string, clients: any[] = []) {
  for (const client of clients || []) {
    const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
    if (!client?.id || !phone) continue;
    try {
      await getOrCreateConversation({ lawFirmId, clientId: client.id, phone, leadName: client.name });
    } catch (error) {
      console.error('Erro ao sincronizar contato do cliente no WhatsApp:', error);
    }
  }
}
