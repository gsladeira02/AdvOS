import 'server-only';
import { defaultWhatsappLeadStage } from '@/lib/whatsappSettings';
import { qualifyPaidLead, type LeadAttribution } from '@/lib/leadAttribution';

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
  firstMessage?: string | null;
  attribution?: LeadAttribution | null;
}) {
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await admin
    .from('whatsapp_leads')
    .select('*')
    .eq('law_firm_id', input.lawFirmId)
    .eq('conversation_id', input.conversationId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  let effectiveAttribution = input.attribution || null;
  let autoQualifyPaidLeads = true;
  if (effectiveAttribution) {
    const { data: trackingSettings, error: trackingSettingsError } = await admin
      .from('lead_tracking_settings')
      .select('meta_tracking_enabled,google_tracking_enabled,auto_qualify_paid_leads')
      .eq('law_firm_id', input.lawFirmId)
      .maybeSingle();
    if (trackingSettingsError) {
      const code = String(trackingSettingsError.code || '');
      if (code === '42P01' || code === 'PGRST205' || String(trackingSettingsError.message || '').toLowerCase().includes('does not exist') || String(trackingSettingsError.message || '').toLowerCase().includes('schema cache')) {
        effectiveAttribution = null;
      }
    } else if (trackingSettings) {
      const platformEnabled = effectiveAttribution.source_platform === 'meta'
        ? trackingSettings.meta_tracking_enabled !== false
        : trackingSettings.google_tracking_enabled !== false;
      if (!platformEnabled) effectiveAttribution = null;
      autoQualifyPaidLeads = trackingSettings.auto_qualify_paid_leads !== false;
    }
  }

  const detectedQualification = qualifyPaidLead({ attribution: effectiveAttribution, message: input.firstMessage, name: input.name });
  const qualification = autoQualifyPaidLeads
    ? detectedQualification
    : { ...detectedQualification, qualified: false, reasons: detectedQualification.reasons.filter((reason) => !reason.toLowerCase().includes('qualific')) };
  let paidLeadStage: string | null = null;
  if (qualification.qualified) {
    const { data: qualifiedStage } = await admin
      .from('whatsapp_lead_stages')
      .select('stage_key')
      .eq('law_firm_id', input.lawFirmId)
      .eq('stage_key', 'qualificado')
      .eq('active', true)
      .eq('outcome', 'open')
      .maybeSingle();
    paidLeadStage = qualifiedStage?.stage_key ? String(qualifiedStage.stage_key) : null;
  }

  const attributionPatch: any = effectiveAttribution ? {
    source: effectiveAttribution.source,
    source_platform: effectiveAttribution.source_platform,
    source_channel: effectiveAttribution.source_channel,
    campaign_id: effectiveAttribution.campaign_id || null,
    campaign_name: effectiveAttribution.campaign_name || null,
    adset_id: effectiveAttribution.adset_id || null,
    adset_name: effectiveAttribution.adset_name || null,
    adgroup_id: effectiveAttribution.adgroup_id || null,
    adgroup_name: effectiveAttribution.adgroup_name || null,
    ad_id: effectiveAttribution.ad_id || null,
    ad_name: effectiveAttribution.ad_name || null,
    creative_id: effectiveAttribution.creative_id || null,
    click_id: effectiveAttribution.click_id || null,
    gclid: effectiveAttribution.gclid || null,
    gbraid: effectiveAttribution.gbraid || null,
    wbraid: effectiveAttribution.wbraid || null,
    utm_source: effectiveAttribution.utm_source || null,
    utm_medium: effectiveAttribution.utm_medium || null,
    utm_campaign: effectiveAttribution.utm_campaign || null,
    utm_content: effectiveAttribution.utm_content || null,
    utm_term: effectiveAttribution.utm_term || null,
    source_url: effectiveAttribution.source_url || null,
    referral_headline: effectiveAttribution.referral_headline || null,
    referral_body: effectiveAttribution.referral_body || null,
    qualification_score: qualification.score,
    qualification_reasons: qualification.reasons,
    qualified_automatically: qualification.qualified,
    attribution_data: effectiveAttribution.raw || {},
  } : {};

  if (existing) {
    if (existing.stage === 'convertido') return { ...existing, _wasCreated: false };
    const patch: any = {
      last_contact_at: input.contactedAt || now,
      updated_at: now,
    };
    if (input.name && (!existing.name || existing.name === existing.phone)) patch.name = input.name;
    if (effectiveAttribution) Object.assign(patch, attributionPatch);
    if (qualification.serviceInterest && !existing.service_interest) patch.service_interest = qualification.serviceInterest;
    if (qualification.qualified && paidLeadStage && ['novo', 'em_atendimento'].includes(String(existing.stage || ''))) patch.stage = paidLeadStage;
    const { data, error } = await admin
      .from('whatsapp_leads')
      .update(patch)
      .eq('id', existing.id)
      .eq('law_firm_id', input.lawFirmId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return { ...data, _wasCreated: false };
  }

  const defaultStage = await defaultWhatsappLeadStage(admin, input.lawFirmId);
  const { data, error } = await admin
    .from('whatsapp_leads')
    .insert({
      law_firm_id: input.lawFirmId,
      conversation_id: input.conversationId,
      name: input.name || null,
      phone: input.phone,
      stage: qualification.qualified && paidLeadStage ? paidLeadStage : defaultStage,
      source: effectiveAttribution?.source || 'whatsapp',
      service_interest: qualification.serviceInterest || null,
      last_contact_at: input.contactedAt || now,
      ...attributionPatch,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return { ...data, _wasCreated: true };
}

export async function attachWhatsappMediaToClientFolder(admin: any, input: {
  lawFirmId: string;
  clientId: string;
  message: any;
}) {
  const { data: preferences } = await admin
    .from('whatsapp_preferences')
    .select('auto_save_client_media')
    .eq('law_firm_id', input.lawFirmId)
    .maybeSingle();
  if (preferences && preferences.auto_save_client_media === false) return null;

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
    const result = await attachWhatsappMediaToClientFolder(admin, {
      lawFirmId: input.lawFirmId,
      clientId: input.clientId,
      message,
    });
    if (result) attached += 1;
  }
  return attached;
}
