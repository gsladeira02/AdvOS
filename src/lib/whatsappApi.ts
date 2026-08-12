import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export type WhatsAppConfig = {
  row: any;
  enabled: boolean;
  configured: boolean;
  token: string;
  baseUrl: string;
  phoneNumberId: string;
  wabaId: string;
  businessPhone: string;
  verifyToken: string;
};

function unmarkdownUrl(value: string) {
  const input = String(value || '').trim();
  const markdown = input.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  return markdown?.[2] || input;
}

function normalizeBaseUrl(url: string) {
  const clean = unmarkdownUrl(url)
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .replace(/\/+$/, '');

  // O AdvOS precisa apenas da base da Graph API. Caso o usuário cole o endpoint
  // completo /{phone-number-id}/messages, removemos esse trecho para evitar URL inválida.
  const match = clean.match(/^(https:\/\/graph\.facebook\.com\/v[0-9.]+)/i);
  if (match?.[1]) return match[1];

  return clean;
}

function normalizeAccessToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '');
}

function graphErrorMessage(payload: any) {
  const error = payload?.error || payload;
  const message = error?.error_data?.details || error?.message || payload?.message || 'Erro ao enviar mensagem pela API oficial do WhatsApp.';
  const code = error?.code ? ` Código ${error.code}${error?.error_subcode ? `/${error.error_subcode}` : ''}.` : '';
  return `${message}${code}`;
}

function isCustomerCareWindowError(payloadOrMessage: any) {
  const text = typeof payloadOrMessage === 'string'
    ? payloadOrMessage
    : graphErrorMessage(payloadOrMessage);
  const normalized = String(text || '').toLowerCase();
  return normalized.includes('24 hours')
    || normalized.includes('24 horas')
    || normalized.includes('customer last replied')
    || normalized.includes('outside the allowed window')
    || normalized.includes('janela de atendimento');
}

function friendlyWhatsAppError(payload: any) {
  const message = graphErrorMessage(payload);
  if (isCustomerCareWindowError(message)) {
    return 'Janela de atendimento encerrada: passaram mais de 24h desde a última resposta do cliente. Pela API oficial, a Meta só permite iniciar a conversa com um template oficial aprovado. Configure o nome do template Meta no modelo de mensagem ou use Abrir Web.';
  }
  return message;
}

function normalizeTemplateName(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function cleanTemplateLanguage(value?: string | null) {
  return String(value || 'pt_BR').trim() || 'pt_BR';
}

function templateComponents(parameters?: string[] | null) {
  const values = (parameters || []).map((value) => String(value ?? '').trim()).filter(Boolean);
  if (!values.length) return undefined;
  return [{
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text })),
  }];
}

function nowIso() {
  return new Date().toISOString();
}

export function defaultWhatsAppBaseUrl(version = 'v22.0') {
  const cleanVersion = String(version || 'v22.0').trim().replace(/^\/+/, '') || 'v22.0';
  return `https://graph.facebook.com/${cleanVersion}`;
}

export async function getWhatsAppConfig(lawFirmId: string): Promise<WhatsAppConfig> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('integration_settings')
    .select('provider,enabled,environment,api_token,token_last4,api_base_url,webhook_secret,default_billing_type,status,notes,raw_settings')
    .eq('law_firm_id', lawFirmId)
    .eq('provider', 'whatsapp')
    .maybeSingle();

  const raw = (data?.raw_settings || {}) as Record<string, any>;
  const token = normalizeAccessToken(data?.api_token || process.env.WHATSAPP_ACCESS_TOKEN || '');
  const phoneNumberId = String(raw.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim().replace(/\D/g, '');
  const wabaId = String(raw.waba_id || process.env.WHATSAPP_WABA_ID || '').trim().replace(/\D/g, '');
  const businessPhone = raw.business_phone || process.env.WHATSAPP_BUSINESS_PHONE || '';
  const version = raw.graph_version || process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';
  const baseUrl = normalizeBaseUrl(data?.api_base_url || process.env.WHATSAPP_API_BASE_URL || defaultWhatsAppBaseUrl(version));
  const verifyToken = data?.webhook_secret || process.env.WHATSAPP_VERIFY_TOKEN || '';

  return {
    row: data,
    enabled: Boolean(data?.enabled),
    configured: Boolean(data?.enabled && token && phoneNumberId),
    token,
    baseUrl,
    phoneNumberId,
    wabaId,
    businessPhone,
    verifyToken,
  };
}

export async function sendWhatsAppText(input: {
  lawFirmId: string;
  to: string;
  message: string;
  clientId?: string | null;
  sentBy?: string | null;
}) {
  const config = await getWhatsAppConfig(input.lawFirmId);
  if (!config.configured) {
    throw new Error('WhatsApp API não configurado. Preencha Access Token e Phone Number ID em Integrações.');
  }

  const to = normalizeBrazilPhone(input.to);
  if (!to) throw new Error('Telefone/WhatsApp do cliente não informado.');

  const body = String(input.message || '').trim();
  if (!body) throw new Error('Mensagem vazia.');

  const endpoint = `${config.baseUrl}/${config.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: true,
        body,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(friendlyWhatsAppError(payload));
  }

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });

  const { data: savedMessage, error: savedMessageError } = await admin.from('whatsapp_messages').insert({
    law_firm_id: input.lawFirmId,
    conversation_id: conversation.id,
    client_id: input.clientId || conversation.client_id || null,
    direction: 'outbound',
    message_type: 'text',
    body,
    external_id: externalId,
    status: 'sent',
    sent_by: input.sentBy || null,
    raw_payload: payload,
  }).select('*').single();

  if (savedMessageError) throw new Error(savedMessageError.message);

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id, message: savedMessage };
}


export async function sendWhatsAppTemplate(input: {
  lawFirmId: string;
  to: string;
  templateName: string;
  language?: string | null;
  parameters?: string[] | null;
  renderedBody?: string | null;
  clientId?: string | null;
  sentBy?: string | null;
}) {
  const config = await getWhatsAppConfig(input.lawFirmId);
  if (!config.configured) {
    throw new Error('WhatsApp API não configurado. Preencha Access Token e Phone Number ID em Integrações.');
  }

  const to = normalizeBrazilPhone(input.to);
  if (!to) throw new Error('Telefone/WhatsApp do cliente não informado.');

  const templateName = normalizeTemplateName(input.templateName);
  if (!templateName) throw new Error('Template oficial da Meta não informado no modelo de mensagem.');

  const payloadBody: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: cleanTemplateLanguage(input.language) },
    },
  };

  const components = templateComponents(input.parameters);
  if (components) payloadBody.template.components = components;

  const endpoint = `${config.baseUrl}/${config.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(friendlyWhatsAppError(payload));
  }

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });
  const body = String(input.renderedBody || `[Template oficial: ${templateName}]`).trim();

  const { data: savedMessage, error: savedMessageError } = await admin.from('whatsapp_messages').insert({
    law_firm_id: input.lawFirmId,
    conversation_id: conversation.id,
    client_id: input.clientId || conversation.client_id || null,
    direction: 'outbound',
    message_type: 'template',
    body,
    external_id: externalId,
    status: 'sent',
    sent_by: input.sentBy || null,
    raw_payload: {
      ...payload,
      advos_template_name: templateName,
      advos_template_language: cleanTemplateLanguage(input.language),
      advos_template_parameters: input.parameters || [],
    },
  }).select('*').single();

  if (savedMessageError) throw new Error(savedMessageError.message);

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id, message: savedMessage };
}


function mediaTypeFromMime(mimeType: string, fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (mime === 'image/webp' || name.endsWith('.webp')) return 'sticker';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function mediaPayload(type: string, url: string, caption?: string | null, filename?: string | null) {
  const cleanCaption = String(caption || '').trim();
  const cleanFilename = String(filename || '').trim();

  if (type === 'image') {
    return { type: 'image', image: { link: url, ...(cleanCaption ? { caption: cleanCaption } : {}) } };
  }
  if (type === 'video') {
    return { type: 'video', video: { link: url, ...(cleanCaption ? { caption: cleanCaption } : {}) } };
  }
  if (type === 'audio') {
    return { type: 'audio', audio: { link: url } };
  }
  if (type === 'sticker') {
    return { type: 'sticker', sticker: { link: url } };
  }
  return {
    type: 'document',
    document: {
      link: url,
      ...(cleanFilename ? { filename: cleanFilename } : {}),
      ...(cleanCaption ? { caption: cleanCaption } : {}),
    },
  };
}

function mediaPayloadById(type: string, mediaId: string, caption?: string | null, filename?: string | null) {
  const cleanCaption = String(caption || '').trim();
  const cleanFilename = String(filename || '').trim();

  if (type === 'image') {
    return { type: 'image', image: { id: mediaId, ...(cleanCaption ? { caption: cleanCaption } : {}) } };
  }
  if (type === 'video') {
    return { type: 'video', video: { id: mediaId, ...(cleanCaption ? { caption: cleanCaption } : {}) } };
  }
  if (type === 'audio') {
    return { type: 'audio', audio: { id: mediaId } };
  }
  if (type === 'sticker') {
    return { type: 'sticker', sticker: { id: mediaId } };
  }
  return {
    type: 'document',
    document: {
      id: mediaId,
      ...(cleanFilename ? { filename: cleanFilename } : {}),
      ...(cleanCaption ? { caption: cleanCaption } : {}),
    },
  };
}

function multipartMimeType(mimeType: string) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (clean === 'audio/ogg') return 'audio/ogg';
  if (clean === 'audio/mp4') return 'audio/mp4';
  if (clean === 'audio/mpeg') return 'audio/mpeg';
  if (clean === 'audio/aac') return 'audio/aac';
  if (clean === 'audio/amr') return 'audio/amr';
  return clean || 'application/octet-stream';
}

async function uploadWhatsAppMediaFromBuffer(input: {
  config: WhatsAppConfig;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) {
  const endpoint = `${input.config.baseUrl}/${input.config.phoneNumberId}/media`;
  const form = new FormData();
  const mime = multipartMimeType(input.mimeType);
  const safeFileName = input.fileName || (mime === 'audio/mpeg' ? 'audio-whatsapp.mp3' : 'arquivo');
  // Usar Blob + filename força o multipart a sair com Content-Type correto.
  // Isso evita a Meta receber áudio gravado como application/octet-stream.
  const blob = new Blob([new Uint8Array(input.buffer)], { type: mime });
  form.set('messaging_product', 'whatsapp');
  form.set('file', blob, safeFileName);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.config.token}` },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(friendlyWhatsAppError(payload));
  }

  return String(payload.id);
}

async function sendWhatsAppMediaByUploadedId(input: {
  config: WhatsAppConfig;
  to: string;
  type: string;
  mediaId: string;
  caption?: string | null;
  fileName?: string | null;
}) {
  const endpoint = `${input.config.baseUrl}/${input.config.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      ...mediaPayloadById(input.type, input.mediaId, input.caption, input.fileName),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(friendlyWhatsAppError(payload));
  }

  return payload;
}

export async function sendWhatsAppMediaBuffer(input: {
  lawFirmId: string;
  to: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  fileSize?: number | null;
  caption?: string | null;
  clientId?: string | null;
  sentBy?: string | null;
  storagePath?: string | null;
  mediaUrl?: string | null;
}) {
  const config = await getWhatsAppConfig(input.lawFirmId);
  if (!config.configured) {
    throw new Error('WhatsApp API não configurado. Preencha Access Token e Phone Number ID em Integrações.');
  }

  const to = normalizeBrazilPhone(input.to);
  if (!to) throw new Error('Telefone/WhatsApp do cliente não informado.');

  const type = mediaTypeFromMime(String(input.mimeType || ''), String(input.fileName || ''));
  const mediaId = await uploadWhatsAppMediaFromBuffer({
    config,
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName || 'arquivo',
  });

  const payload = await sendWhatsAppMediaByUploadedId({
    config,
    to,
    type,
    mediaId,
    caption: input.caption,
    fileName: input.fileName,
  });

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });
  const body = String(input.caption || input.fileName || (type === 'audio' ? '[Áudio enviado]' : type === 'image' ? 'Imagem' : type === 'sticker' ? '[Figurinha]' : 'Documento')).trim();

  const { data: savedMessage, error: savedMessageError } = await admin.from('whatsapp_messages').insert({
    law_firm_id: input.lawFirmId,
    conversation_id: conversation.id,
    client_id: input.clientId || conversation.client_id || null,
    direction: 'outbound',
    message_type: type,
    body,
    external_id: externalId,
    status: 'sent',
    sent_by: input.sentBy || null,
    raw_payload: { ...payload, advos_media_id: mediaId, advos_media_url: input.mediaUrl || null, advos_storage_path: input.storagePath || null },
    file_name: input.fileName || null,
    file_size: input.fileSize || null,
    mime_type: input.mimeType || null,
    media_url: input.mediaUrl || null,
    storage_path: input.storagePath || null,
  }).select('*').single();

  if (savedMessageError) throw new Error(savedMessageError.message);

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id, type, message: savedMessage, mediaId };
}

export async function sendWhatsAppMedia(input: {
  lawFirmId: string;
  to: string;
  mediaUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  caption?: string | null;
  clientId?: string | null;
  sentBy?: string | null;
  storagePath?: string | null;
}) {
  const config = await getWhatsAppConfig(input.lawFirmId);
  if (!config.configured) {
    throw new Error('WhatsApp API não configurado. Preencha Access Token e Phone Number ID em Integrações.');
  }

  const to = normalizeBrazilPhone(input.to);
  if (!to) throw new Error('Telefone/WhatsApp do cliente não informado.');

  const mediaUrl = String(input.mediaUrl || '').trim();
  if (!mediaUrl) throw new Error('Arquivo sem URL pública temporária para envio.');

  const type = mediaTypeFromMime(String(input.mimeType || ''), String(input.fileName || ''));
  const endpoint = `${config.baseUrl}/${config.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...mediaPayload(type, mediaUrl, input.caption, input.fileName),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(friendlyWhatsAppError(payload));
  }

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });
  const body = String(input.caption || input.fileName || (type === 'image' ? 'Imagem' : type === 'sticker' ? '[Figurinha]' : 'Documento')).trim();

  const { data: savedMessage, error: savedMessageError } = await admin.from('whatsapp_messages').insert({
    law_firm_id: input.lawFirmId,
    conversation_id: conversation.id,
    client_id: input.clientId || conversation.client_id || null,
    direction: 'outbound',
    message_type: type,
    body,
    external_id: externalId,
    status: 'sent',
    sent_by: input.sentBy || null,
    raw_payload: { ...payload, advos_media_url: mediaUrl, advos_storage_path: input.storagePath || null },
    file_name: input.fileName || null,
    file_size: input.fileSize || null,
    mime_type: input.mimeType || null,
    media_url: mediaUrl,
    storage_path: input.storagePath || null,
  }).select('*').single();

  if (savedMessageError) throw new Error(savedMessageError.message);

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id, type, message: savedMessage };
}

export async function getOrCreateConversation(input: {
  lawFirmId: string;
  clientId?: string | null;
  phone: string;
  leadName?: string | null;
}) {
  const admin = createAdminSupabase();
  const phone = normalizeBrazilPhone(input.phone);
  if (!phone) throw new Error('Telefone/WhatsApp inválido.');

  let existing: any = null;

  if (input.clientId) {
    const byClient = await admin
      .from('whatsapp_conversations')
      .select('*')
      .eq('law_firm_id', input.lawFirmId)
      .eq('client_id', input.clientId)
      .limit(1)
      .maybeSingle();
    existing = byClient.data;
  }

  if (!existing) {
    const byPhone = await admin
      .from('whatsapp_conversations')
      .select('*')
      .eq('law_firm_id', input.lawFirmId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    existing = byPhone.data;
  }

  if (existing) {
    const patch: any = {};
    if (input.clientId && !existing.client_id) patch.client_id = input.clientId;
    if (input.leadName && !existing.lead_name) patch.lead_name = input.leadName;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { data } = await admin
        .from('whatsapp_conversations')
        .update(patch)
        .eq('id', existing.id)
        .eq('law_firm_id', input.lawFirmId)
        .select('*')
        .single();
      return data || { ...existing, ...patch };
    }
    return existing;
  }

  const { data, error } = await admin
    .from('whatsapp_conversations')
    .insert({
      law_firm_id: input.lawFirmId,
      client_id: input.clientId || null,
      phone,
      lead_name: input.leadName || null,
      status: 'aberta',
      last_message_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export function firstTextFromInboundMessage(message: any) {
  if (!message) return '';
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || message.button?.payload || '';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[Mensagem interativa]';
  if (message.type === 'image') return message.image?.caption || '[Imagem recebida]';
  if (message.type === 'document') return message.document?.caption || message.document?.filename || '[Documento recebido]';
  if (message.type === 'audio') return '[Áudio recebido]';
  if (message.type === 'video') return message.video?.caption || '[Vídeo recebido]';
  if (message.type === 'sticker') return '[Figurinha recebida]';
  if (message.type === 'reaction') return message.reaction?.emoji || '[Reação recebida]';
  return `[${message.type || 'Mensagem'} recebida]`;
}


export async function sendWhatsAppReaction(input: {
  lawFirmId: string;
  messageId: string;
  emoji: string;
  reactedBy?: string | null;
}) {
  const admin = createAdminSupabase();
  const { data: messageRow, error: messageError } = await admin
    .from('whatsapp_messages')
    .select('id,law_firm_id,conversation_id,external_id,client_id')
    .eq('law_firm_id', input.lawFirmId)
    .eq('id', input.messageId)
    .maybeSingle();

  if (messageError) throw new Error(messageError.message);
  if (!messageRow?.id) throw new Error('Mensagem não encontrada.');
  if (!messageRow.external_id) throw new Error('Essa mensagem ainda não tem ID externo da Meta para receber reação.');

  const { data: conversation, error: conversationError } = await admin
    .from('whatsapp_conversations')
    .select('id,phone')
    .eq('law_firm_id', input.lawFirmId)
    .eq('id', messageRow.conversation_id)
    .maybeSingle();

  if (conversationError) throw new Error(conversationError.message);

  const config = await getWhatsAppConfig(input.lawFirmId);
  if (!config.configured) throw new Error('WhatsApp API não configurado.');

  const to = normalizeBrazilPhone(conversation?.phone || '');
  if (!to) throw new Error('Telefone da conversa não encontrado.');

  const endpoint = `${config.baseUrl}/${config.phoneNumberId}/messages`;
  const emoji = String(input.emoji || '').trim();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: {
        message_id: messageRow.external_id,
        emoji,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(friendlyWhatsAppError(payload));

  const { data, error } = await admin
    .from('whatsapp_messages')
    .update({
      reaction_emoji: emoji || null,
      reacted_at: emoji ? new Date().toISOString() : null,
      reaction_by: input.reactedBy || null,
    })
    .eq('law_firm_id', input.lawFirmId)
    .eq('id', messageRow.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { payload, message: data };
}
