import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function safe(value: string | null, max = 300) {
  const text = String(value || '').trim().slice(0, max);
  // Se o Google abrir a URL sem substituir um ValueTrack, não gravamos a macro literal.
  if (/^\{[^}]+\}$/.test(text)) return null;
  return text || null;
}

function rawParams(url: URL) {
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key === 'token') return;
    out[String(key).slice(0, 80)] = String(value).slice(0, 1000);
  });
  return out;
}

async function createReference(admin: any, payload: any) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicRef = randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase();
    const { data, error } = await admin
      .from('lead_tracking_clicks')
      .insert({ ...payload, public_ref: publicRef })
      .select('id,public_ref')
      .single();
    if (!error && data?.public_ref) return String(data.public_ref);
    if (String(error?.code || '') !== '23505') throw new Error(error?.message || 'Não foi possível registrar o clique.');
  }
  throw new Error('Não foi possível gerar uma referência única.');
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = String(url.searchParams.get('token') || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse('Link de rastreamento inválido.', { status: 404 });

    const admin = createAdminSupabase();
    const { data: tracking, error: trackingError } = await admin
      .from('lead_tracking_settings')
      .select('law_firm_id,google_tracking_enabled,google_default_message')
      .eq('public_token', token)
      .maybeSingle();
    if (trackingError || !tracking?.law_firm_id || tracking.google_tracking_enabled === false) {
      return new NextResponse('Rastreamento do Google indisponível.', { status: 404 });
    }

    const { data: integration } = await admin
      .from('integration_settings')
      .select('enabled,raw_settings')
      .eq('law_firm_id', tracking.law_firm_id)
      .eq('provider', 'whatsapp')
      .eq('enabled', true)
      .maybeSingle();

    const businessPhone = normalizeBrazilPhone(
      integration?.raw_settings?.business_phone
      || integration?.raw_settings?.display_phone_number
      || integration?.raw_settings?.phone
      || ''
    );
    if (!businessPhone) return new NextResponse('WhatsApp comercial não configurado no AdvOS.', { status: 503 });

    const params = rawParams(url);
    const gclid = safe(url.searchParams.get('gclid'), 300);
    const gbraid = safe(url.searchParams.get('gbraid'), 300);
    const wbraid = safe(url.searchParams.get('wbraid'), 300);
    const campaignId = safe(url.searchParams.get('campaignid') || url.searchParams.get('campaign_id'), 100);
    const adgroupId = safe(url.searchParams.get('adgroupid') || url.searchParams.get('adgroup_id'), 100);
    const creativeId = safe(url.searchParams.get('creative') || url.searchParams.get('creative_id') || url.searchParams.get('adid'), 100);
    const keyword = safe(url.searchParams.get('keyword'), 300);

    const publicRef = await createReference(admin, {
      law_firm_id: tracking.law_firm_id,
      provider: 'google_ads',
      gclid,
      gbraid,
      wbraid,
      campaign_id: campaignId,
      campaign_name: safe(url.searchParams.get('campaign_name') || url.searchParams.get('utm_campaign'), 300),
      adgroup_id: adgroupId,
      adgroup_name: safe(url.searchParams.get('adgroup_name'), 300),
      ad_id: creativeId,
      ad_name: safe(url.searchParams.get('ad_name') || url.searchParams.get('utm_content'), 300),
      creative_id: creativeId,
      keyword,
      match_type: safe(url.searchParams.get('matchtype'), 80),
      network: safe(url.searchParams.get('network'), 80),
      device: safe(url.searchParams.get('device'), 80),
      placement: safe(url.searchParams.get('placement'), 300),
      utm_source: safe(url.searchParams.get('utm_source'), 100) || 'google',
      utm_medium: safe(url.searchParams.get('utm_medium'), 100) || 'cpc',
      utm_campaign: safe(url.searchParams.get('utm_campaign'), 300),
      utm_content: safe(url.searchParams.get('utm_content'), 300),
      utm_term: safe(url.searchParams.get('utm_term'), 300) || keyword,
      raw_params: params,
    });

    const customMessage = safe(url.searchParams.get('message'), 600);
    const baseMessage = customMessage || String(tracking.google_default_message || 'Olá! Gostaria de falar com um advogado.').trim();
    const message = `${baseMessage}\n\nRef: ADV-${publicRef}`;
    const destination = `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
    return NextResponse.redirect(destination, 302);
  } catch (error) {
    console.error('Erro no rastreamento Google → WhatsApp:', error);
    return new NextResponse('Não foi possível abrir o WhatsApp.', { status: 500 });
  }
}
