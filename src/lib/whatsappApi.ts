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
    throw new Error(graphErrorMessage(payload));
  }

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });

  await admin.from('whatsapp_messages').insert({
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
  });

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id };
}


function mediaTypeFromMime(mimeType: string) {
  const mime = String(mimeType || '').toLowerCase();
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
  return {
    type: 'document',
    document: {
      link: url,
      ...(cleanFilename ? { filename: cleanFilename } : {}),
      ...(cleanCaption ? { caption: cleanCaption } : {}),
    },
  };
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

  const type = mediaTypeFromMime(String(input.mimeType || ''));
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
    throw new Error(graphErrorMessage(payload));
  }

  const externalId = payload?.messages?.[0]?.id || null;
  const admin = createAdminSupabase();
  const conversation = await getOrCreateConversation({ lawFirmId: input.lawFirmId, clientId: input.clientId, phone: to });
  const body = String(input.caption || input.fileName || (type === 'image' ? 'Imagem' : 'Documento')).trim();

  await admin.from('whatsapp_messages').insert({
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
  });

  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)
    .eq('law_firm_id', input.lawFirmId);

  return { payload, externalId, conversationId: conversation.id, type };
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
  return `[${message.type || 'Mensagem'} recebida]`;
}
