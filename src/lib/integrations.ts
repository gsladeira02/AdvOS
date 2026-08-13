import { createAdminSupabase } from '@/lib/supabase/admin';

export type Provider = 'zapsign' | 'asaas' | 'whatsapp';

type IntegrationRow = {
  provider: Provider;
  enabled: boolean;
  environment: string | null;
  api_token: string | null;
  token_last4: string | null;
  api_base_url: string | null;
  webhook_secret: string | null;
  default_billing_type: string | null;
  status: string | null;
  raw_settings?: Record<string, any> | null;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

export function defaultBaseUrl(provider: Provider, environment?: string | null) {
  if (provider === 'asaas') {
    return environment === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
  }
  if (provider === 'whatsapp') return 'https://graph.facebook.com/v26.0';
  return 'https://api.zapsign.com.br/api/v1';
}

export function safeIntegrationBaseUrl(provider: Provider, environment?: string | null, candidate?: string | null) {
  const env = environment === 'producao' ? 'producao' : 'sandbox';

  if (provider === 'asaas') return defaultBaseUrl('asaas', env);
  if (provider === 'zapsign') return defaultBaseUrl('zapsign', env);

  const fallback = defaultBaseUrl('whatsapp', env);
  const raw = normalizeBaseUrl(String(candidate || fallback).trim());
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'graph.facebook.com') return fallback;
    const match = url.pathname.match(/^\/v\d+(?:\.\d+)?$/i);
    return match ? `https://graph.facebook.com${match[0]}` : fallback;
  } catch {
    return fallback;
  }
}

export async function getIntegrationConfig(lawFirmId: string, provider: Provider) {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('integration_settings')
    .select('provider,enabled,environment,api_token,token_last4,api_base_url,webhook_secret,default_billing_type,status,raw_settings')
    .eq('law_firm_id', lawFirmId)
    .eq('provider', provider)
    .maybeSingle();

  const envToken = provider === 'zapsign' ? process.env.ZAPSIGN_API_TOKEN : provider === 'asaas' ? process.env.ASAAS_API_KEY : process.env.WHATSAPP_ACCESS_TOKEN;
  const envBase = provider === 'zapsign' ? process.env.ZAPSIGN_API_BASE_URL : provider === 'asaas' ? process.env.ASAAS_API_BASE_URL : process.env.WHATSAPP_API_BASE_URL;
  const token = data?.api_token || envToken || '';
  const environment = data?.environment || 'sandbox';
  const baseUrl = safeIntegrationBaseUrl(provider, environment, data?.api_base_url || envBase || null);

  return {
    row: data as IntegrationRow | null,
    enabled: Boolean(data?.enabled),
    configured: Boolean(data?.enabled && token),
    token,
    baseUrl,
    environment,
    defaultBillingType: data?.default_billing_type || 'BOLETO',
    webhookSecret: data?.webhook_secret || '',
  };
}

export function tokenLast4(token: string) {
  const cleaned = String(token || '').trim();
  return cleaned ? cleaned.slice(-4) : null;
}
