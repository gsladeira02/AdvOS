import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { defaultBaseUrl, safeIntegrationBaseUrl, tokenLast4 } from '@/lib/integrations';
import { enforceRateLimit, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const provider = str(f.get('provider')) as 'zapsign' | 'asaas' | 'whatsapp' | 'openai';

  if (!['zapsign', 'asaas', 'whatsapp', 'openai'].includes(provider)) {
    return NextResponse.json({ error: 'Integração inválida.' }, { status: 400 });
  }

  const environment = str(f.get('environment')) === 'producao' ? 'producao' : 'sandbox';
  const apiToken = str(f.get('api_token'));
  const requestedBaseUrl = str(f.get('api_base_url')) || defaultBaseUrl(provider, environment);
  const apiBaseUrl = safeIntegrationBaseUrl(provider, environment, requestedBaseUrl);
  const submittedWebhookSecret = str(f.get('webhook_secret'));
  const requestedEnabled = str(f.get('enabled')) === 'true';
  // Ao informar uma nova chave da OpenAI, ativamos a transcrição automaticamente.
  // Para desativar depois, basta salvar novamente sem informar chave e escolher Desativada.
  const enabled = provider === 'openai' && apiToken ? true : requestedEnabled;
  const admin = createAdminSupabase();
  try {
    await enforceRateLimit(admin, `user:${session.user.id}:integration-settings`, 20, 3600);
  } catch (error: any) {
    return NextResponse.json({ error: error instanceof SecurityError ? error.message : 'Não foi possível validar a operação.' }, { status: error instanceof SecurityError ? error.status : 503 });
  }

  const existing = await admin
    .from('integration_settings')
    .select('id,api_token,token_last4,webhook_secret,raw_settings')
    .eq('law_firm_id', profile.law_firm_id)
    .eq('provider', provider)
    .maybeSingle();

  const requestedTranscriptionModel = str(f.get('transcription_model'));
  const transcriptionModel = ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(requestedTranscriptionModel)
    ? requestedTranscriptionModel
    : 'gpt-transcribe';

  const rawSettings: any = provider === 'whatsapp' ? {
    phone_number_id: str(f.get('phone_number_id')),
    waba_id: str(f.get('waba_id')),
    business_phone: str(f.get('business_phone')),
    graph_version: str(f.get('graph_version')) || 'v26.0',
    profile_display_name: str(f.get('profile_display_name')),
    profile_picture_note: str(f.get('profile_picture_note')),
  } : provider === 'openai' ? {
    ...(existing.data?.raw_settings || {}),
    transcription_model: transcriptionModel,
    transcription_language: 'pt',
  } : existing.data?.raw_settings || null;

  const zapsignSecret = provider === 'zapsign'
    ? (existing.data?.webhook_secret || randomBytes(32).toString('hex'))
    : null;

  const payload: any = {
    law_firm_id: profile.law_firm_id,
    provider,
    enabled,
    environment,
    api_base_url: apiBaseUrl,
    default_billing_type: provider === 'asaas' ? str(f.get('default_billing_type')) || 'BOLETO' : null,
    webhook_secret: zapsignSecret || submittedWebhookSecret || existing.data?.webhook_secret || null,
    raw_settings: rawSettings,
    status: enabled ? 'configurado' : 'desativado',
    updated_at: new Date().toISOString(),
  };

  if (apiToken) {
    payload.api_token = apiToken;
    payload.token_last4 = tokenLast4(apiToken);
  } else if (existing.data?.id) {
    payload.api_token = existing.data.api_token;
    payload.token_last4 = existing.data.token_last4;
  }

  const { error } = await admin
    .from('integration_settings')
    .upsert(payload, { onConflict: 'law_firm_id,provider' });

  if (error) return NextResponse.json({ error: 'Não foi possível salvar a integração.' }, { status: 400 });

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: session.user.id,
    action: `atualizou_integracao_${provider}`,
    entity: 'integration_settings',
  });

  await recordSecurityEvent({ lawFirmId: profile.law_firm_id, authUserId: session.user.id, eventType: 'integration_updated', entity: 'integration_settings', req, metadata: { provider, enabled, environment } });
  const destination = provider === 'openai' ? '/app/integracoes?openai=salvo' : '/app/integracoes';
  return NextResponse.redirect(new URL(destination, req.url), 303);
}
