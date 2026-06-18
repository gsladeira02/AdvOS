import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { defaultBaseUrl, tokenLast4 } from '@/lib/integrations';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const f = await req.formData();
  const provider = str(f.get('provider'));

  if (!['zapsign', 'asaas'].includes(provider)) {
    return NextResponse.json({ error: 'Integração inválida.' }, { status: 400 });
  }

  const environment = str(f.get('environment')) || 'sandbox';
  const apiToken = str(f.get('api_token'));
  const apiBaseUrl = str(f.get('api_base_url')) || defaultBaseUrl(provider as any, environment);
  const enabled = str(f.get('enabled')) === 'true';
  const admin = createAdminSupabase();

  const existing = await admin
    .from('integration_settings')
    .select('id,api_token,token_last4')
    .eq('law_firm_id', profile.law_firm_id)
    .eq('provider', provider)
    .maybeSingle();

  const payload: any = {
    law_firm_id: profile.law_firm_id,
    provider,
    enabled,
    environment,
    api_base_url: apiBaseUrl,
    default_billing_type: provider === 'asaas' ? str(f.get('default_billing_type')) || 'BOLETO' : null,
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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: session.user.id,
    action: `atualizou_integracao_${provider}`,
    entity: 'integration_settings',
  });

  return NextResponse.redirect(new URL('/app/integracoes', req.url), 303);
}
