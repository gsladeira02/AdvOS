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

export function mergeClientContactsIntoConversations(conversations: any[] = [], clients: any[] = []) {
  const byClient = new Set<string>();
  const byPhone = new Set<string>();

  for (const conversation of conversations || []) {
    if (conversation.client_id) byClient.add(String(conversation.client_id));
    const phone = normalizeBrazilPhone(conversation.phone);
    if (phone) byPhone.add(phone);
  }

  const virtuals = (clients || [])
    .map((client) => {
      const phone = normalizeBrazilPhone(client.whatsapp || client.phone || '');
      if (!phone || byClient.has(String(client.id)) || byPhone.has(phone)) return null;
      return {
        id: virtualConversationId(client.id),
        law_firm_id: client.law_firm_id,
        client_id: client.id,
        phone,
        lead_name: titleForClient(client),
        status: 'nova',
        last_message_at: null,
        unread_count: 0,
        updated_at: client.updated_at || client.created_at || null,
        virtual: true,
        clients: {
          id: client.id,
          name: client.name,
          whatsapp: client.whatsapp,
          phone: client.phone,
        },
      };
    })
    .filter(Boolean);

  return [...(conversations || []), ...virtuals];
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
