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


export async function getVisibleConversationActivity(admin: any, lawFirmId: string) {
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('conversation_id,created_at,body,message_type,direction,status,file_name,mime_type')
    .eq('law_firm_id', lawFirmId)
    .is('deleted_at', null)
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) throw new Error(error.message);

  // Como a consulta vem da mensagem mais nova para a mais antiga, a primeira
  // ocorrência de cada conversation_id é também a prévia que deve aparecer
  // na lista, como no WhatsApp.
  const activity = new Map<string, any>();
  for (const row of data || []) {
    const conversationId = String(row?.conversation_id || '');
    if (!conversationId || activity.has(conversationId)) continue;
    activity.set(conversationId, {
      created_at: String(row?.created_at || ''),
      body: String(row?.body || ''),
      message_type: String(row?.message_type || 'text'),
      direction: String(row?.direction || ''),
      status: String(row?.status || ''),
      file_name: row?.file_name || null,
      mime_type: row?.mime_type || null,
    });
  }
  return activity;
}

export async function loadVisibleConversations(admin: any, lawFirmId: string, maxConversations = 500) {
  const activity = await getVisibleConversationActivity(admin, lawFirmId);
  const activeIds = Array.from(activity.keys()).slice(0, Math.max(1, maxConversations));
  if (!activeIds.length) return [];

  const rows: any[] = [];
  const batchSize = 80;
  for (let index = 0; index < activeIds.length; index += batchSize) {
    const batch = activeIds.slice(index, index + batchSize);
    const { data, error } = await admin
      .from('whatsapp_conversations')
      .select('*, clients(id,name,whatsapp,phone,email,doc)')
      .eq('law_firm_id', lawFirmId)
      .in('id', batch);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }

  const { data: leadRows, error: leadError } = await admin
    .from('whatsapp_leads')
    .select('*')
    .eq('law_firm_id', lawFirmId)
    .in('conversation_id', activeIds);
  if (leadError) throw new Error(leadError.message);
  const leadByConversation = new Map((leadRows || []).map((lead: any) => [String(lead.conversation_id), lead]));

  return rows
    .map((conversation: any) => {
      const latest = activity.get(String(conversation.id));
      return {
        ...conversation,
        department: conversation.department || 'atendimento',
        tags: Array.isArray(conversation.tags) ? conversation.tags : [],
        lead: leadByConversation.get(String(conversation.id)) || null,
        has_messages: true,
        message_count: 1,
        last_message_at: latest?.created_at || conversation.last_message_at || null,
        last_message_body: latest?.body || '',
        last_message_type: latest?.message_type || 'text',
        last_message_direction: latest?.direction || '',
        last_message_status: latest?.status || '',
        last_message_file_name: latest?.file_name || null,
        last_message_mime_type: latest?.mime_type || null,
      };
    })
    .sort((a: any, b: any) => {
      const aTime = new Date(a.last_message_at || 0).getTime();
      const bTime = new Date(b.last_message_at || 0).getTime();
      return bTime - aTime;
    });
}
