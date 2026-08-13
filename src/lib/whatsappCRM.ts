import 'server-only';

function safeTitle(value?: string | null, fallback = 'Mídia recebida pelo WhatsApp') {
  const text = String(value || '').trim().replace(/[\r\n\t]+/g, ' ');
  return (text || fallback).slice(0, 180);
}

export async function ensureWhatsappLead(admin: any, input: {
  lawFirmId: string;
  conversationId: string;
  phone: string;
  name?: string | null;
  contactedAt?: string | null;
}) {
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await admin
    .from('whatsapp_leads')
    .select('*')
    .eq('law_firm_id', input.lawFirmId)
    .eq('conversation_id', input.conversationId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    if (existing.stage === 'convertido') return existing;
    const patch: any = {
      last_contact_at: input.contactedAt || now,
      updated_at: now,
    };
    if (input.name && (!existing.name || existing.name === existing.phone)) patch.name = input.name;
    const { data, error } = await admin
      .from('whatsapp_leads')
      .update(patch)
      .eq('id', existing.id)
      .eq('law_firm_id', input.lawFirmId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await admin
    .from('whatsapp_leads')
    .insert({
      law_firm_id: input.lawFirmId,
      conversation_id: input.conversationId,
      name: input.name || null,
      phone: input.phone,
      stage: 'novo',
      source: 'whatsapp',
      last_contact_at: input.contactedAt || now,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function attachWhatsappMediaToClientFolder(admin: any, input: {
  lawFirmId: string;
  clientId: string;
  message: any;
}) {
  const message = input.message || {};
  const storagePath = String(message.storage_path || '').trim();
  if (!storagePath) return null;

  const externalId = String(message.external_id || message.id || '').trim();
  if (!externalId) return null;

  const title = safeTitle(message.file_name, message.message_type === 'image'
    ? 'Imagem recebida pelo WhatsApp'
    : message.message_type === 'video'
      ? 'Vídeo recebido pelo WhatsApp'
      : message.message_type === 'audio'
        ? 'Áudio recebido pelo WhatsApp'
        : 'Arquivo recebido pelo WhatsApp');

  const { data, error } = await admin
    .from('documents')
    .upsert({
      law_firm_id: input.lawFirmId,
      client_id: input.clientId,
      title,
      doc_type: 'whatsapp',
      storage_path: storagePath,
      source: 'whatsapp',
      source_external_id: externalId,
      notes: `Recebido automaticamente pelo WhatsApp${message.created_at ? ` em ${new Date(message.created_at).toLocaleString('pt-BR')}` : ''}.`,
    }, {
      onConflict: 'law_firm_id,source,source_external_id',
      ignoreDuplicates: false,
    })
    .select('id,client_id,title,storage_path')
    .maybeSingle();

  if (error) {
    // Alguns ambientes antigos podem não aceitar upsert em índice parcial via PostgREST.
    // Fazemos fallback idempotente por source_external_id.
    const { data: existing } = await admin
      .from('documents')
      .select('id,client_id,title,storage_path')
      .eq('law_firm_id', input.lawFirmId)
      .eq('source', 'whatsapp')
      .eq('source_external_id', externalId)
      .maybeSingle();
    if (existing?.id) {
      if (String(existing.client_id || '') !== String(input.clientId)) {
        await admin.from('documents').update({ client_id: input.clientId }).eq('id', existing.id).eq('law_firm_id', input.lawFirmId);
      }
      return existing;
    }

    const { data: inserted, error: insertError } = await admin
      .from('documents')
      .insert({
        law_firm_id: input.lawFirmId,
        client_id: input.clientId,
        title,
        doc_type: 'whatsapp',
        storage_path: storagePath,
        source: 'whatsapp',
        source_external_id: externalId,
        notes: 'Recebido automaticamente pelo WhatsApp.',
      })
      .select('id,client_id,title,storage_path')
      .single();
    if (insertError) throw new Error(insertError.message);
    return inserted;
  }

  return data;
}

export async function attachConversationMediaToClientFolder(admin: any, input: {
  lawFirmId: string;
  conversationId: string;
  clientId: string;
}) {
  const { data: messages, error } = await admin
    .from('whatsapp_messages')
    .select('id,external_id,message_type,file_name,storage_path,created_at')
    .eq('law_firm_id', input.lawFirmId)
    .eq('conversation_id', input.conversationId)
    .eq('direction', 'inbound')
    .not('storage_path', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  let attached = 0;
  for (const message of messages || []) {
    await attachWhatsappMediaToClientFolder(admin, {
      lawFirmId: input.lawFirmId,
      clientId: input.clientId,
      message,
    });
    attached += 1;
  }
  return attached;
}
