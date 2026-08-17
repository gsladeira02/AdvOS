import 'server-only';

export const WHATSAPP_COLORS = ['slate', 'sky', 'emerald', 'violet', 'amber', 'rose', 'red', 'green', 'indigo'] as const;

export function normalizeStageKey(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'etapa';
}

export async function loadWhatsappSettings(admin: any, lawFirmId: string) {
  const [{ data: tags, error: tagsError }, { data: stages, error: stagesError }, { data: preferences, error: preferencesError }, autoRepliesResult, leadTrackingResult] = await Promise.all([
    admin
      .from('whatsapp_tags')
      .select('id,name,color,active,sort_order,created_at,updated_at')
      .eq('law_firm_id', lawFirmId)
      .order('active', { ascending: false })
      .order('sort_order')
      .order('name'),
    admin
      .from('whatsapp_lead_stages')
      .select('id,stage_key,name,color,active,sort_order,outcome,created_at,updated_at')
      .eq('law_firm_id', lawFirmId)
      .order('active', { ascending: false })
      .order('sort_order')
      .order('name'),
    admin
      .from('whatsapp_preferences')
      .select('*')
      .eq('law_firm_id', lawFirmId)
      .maybeSingle(),
    admin
      .from('whatsapp_auto_replies')
      .select('id,name,trigger_type,message,keywords,department,active,sort_order,created_at,updated_at')
      .eq('law_firm_id', lawFirmId)
      .order('active', { ascending: false })
      .order('sort_order')
      .order('created_at'),
    admin
      .from('lead_tracking_settings')
      .select('law_firm_id,public_token,meta_tracking_enabled,google_tracking_enabled,auto_qualify_paid_leads,google_default_message,updated_at')
      .eq('law_firm_id', lawFirmId)
      .maybeSingle(),
  ]);

  if (tagsError) throw new Error(tagsError.message);
  if (stagesError) throw new Error(stagesError.message);
  if (preferencesError) throw new Error(preferencesError.message);
  const autoRepliesError = autoRepliesResult?.error;
  const autoReplyErrorCode = String(autoRepliesError?.code || '');
  const autoRepliesUnavailable = autoReplyErrorCode === '42P01' || autoReplyErrorCode === 'PGRST205' || String(autoRepliesError?.message || '').toLowerCase().includes('does not exist') || String(autoRepliesError?.message || '').toLowerCase().includes('schema cache');
  if (autoRepliesError && !autoRepliesUnavailable) throw new Error(autoRepliesError.message);

  const leadTrackingError = leadTrackingResult?.error;
  const leadTrackingErrorCode = String(leadTrackingError?.code || '');
  const leadTrackingUnavailable = leadTrackingErrorCode === '42P01' || leadTrackingErrorCode === 'PGRST205' || String(leadTrackingError?.message || '').toLowerCase().includes('does not exist') || String(leadTrackingError?.message || '').toLowerCase().includes('schema cache');
  if (leadTrackingError && !leadTrackingUnavailable) throw new Error(leadTrackingError.message);

  return {
    tags: tags || [],
    stages: stages || [],
    autoReplies: autoRepliesUnavailable ? [] : (autoRepliesResult?.data || []),
    leadTracking: leadTrackingUnavailable ? null : (leadTrackingResult?.data || null),
    preferences: preferences || {
      law_firm_id: lawFirmId,
      lead_label_singular: 'Lead',
      lead_label_plural: 'Leads',
      default_lead_stage_key: 'novo',
      default_department: 'atendimento',
      auto_save_client_media: true,
    },
  };
}

export async function defaultWhatsappLeadStage(admin: any, lawFirmId: string) {
  const { data: preferences } = await admin
    .from('whatsapp_preferences')
    .select('default_lead_stage_key')
    .eq('law_firm_id', lawFirmId)
    .maybeSingle();

  const preferred = String(preferences?.default_lead_stage_key || 'novo');
  const { data: stage } = await admin
    .from('whatsapp_lead_stages')
    .select('stage_key')
    .eq('law_firm_id', lawFirmId)
    .eq('stage_key', preferred)
    .eq('active', true)
    .eq('outcome', 'open')
    .maybeSingle();

  if (stage?.stage_key) return String(stage.stage_key);

  const { data: fallback } = await admin
    .from('whatsapp_lead_stages')
    .select('stage_key')
    .eq('law_firm_id', lawFirmId)
    .eq('active', true)
    .eq('outcome', 'open')
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  return String(fallback?.stage_key || 'novo');
}
