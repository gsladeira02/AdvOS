import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';

function fallbackSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  let config = await getIntegrationConfig(profile.law_firm_id, 'asaas');

  if (!config.configured) {
    return NextResponse.redirect(new URL('/app/integracoes?asaas=sem_chave', req.url), 303);
  }

  let webhookSecret = config.webhookSecret || fallbackSecret();
  if (!config.webhookSecret) {
    await admin.from('integration_settings').update({ webhook_secret: webhookSecret }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');
    config = await getIntegrationConfig(profile.law_firm_id, 'asaas');
    webhookSecret = config.webhookSecret || webhookSecret;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const webhookUrl = `${appUrl.replace(/\/+$/, '')}/api/webhooks/asaas`;

  try {
    const response = await fetch(`${config.baseUrl}/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        'User-Agent': 'AdvOS',
        access_token: config.token,
      },
      body: JSON.stringify({
        name: 'AdvOS - Cobranças',
        url: webhookUrl,
        email: profile.email || session.user.email,
        enabled: true,
        interrupted: false,
        sendType: 'SEQUENTIALLY',
        apiVersion: 3,
        authToken: webhookSecret,
        events: [
          'PAYMENT_CREATED',
          'PAYMENT_UPDATED',
          'PAYMENT_CONFIRMED',
          'PAYMENT_RECEIVED',
          'PAYMENT_RECEIVED_IN_CASH',
          'PAYMENT_OVERDUE',
          'PAYMENT_DELETED',
          'PAYMENT_RESTORED',
          'PAYMENT_REFUNDED',
          'PAYMENT_PARTIALLY_REFUNDED',
          'PAYMENT_CHARGEBACK_REQUESTED',
          'PAYMENT_DUNNING_RECEIVED',
          'PAYMENT_DUNNING_REQUESTED',
        ],
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.errors?.[0]?.description || json?.message || 'Não foi possível criar o webhook no Asaas.';
      await admin.from('integration_settings').update({
        status: 'erro_webhook',
        notes: message,
        updated_at: new Date().toISOString(),
      }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');
      return NextResponse.redirect(new URL('/app/integracoes?asaas=erro_webhook', req.url), 303);
    }

    await admin.from('integration_settings').update({
      status: 'webhook_configurado',
      notes: `Webhook Asaas configurado: ${json?.id || webhookUrl}`,
      updated_at: new Date().toISOString(),
    }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'configurou_webhook_asaas',
      entity: 'integration_settings',
    });

    return NextResponse.redirect(new URL('/app/integracoes?asaas=webhook_configurado', req.url), 303);
  } catch (error: any) {
    await admin.from('integration_settings').update({
      status: 'erro_webhook',
      notes: error?.message || 'Erro desconhecido ao criar webhook Asaas.',
      updated_at: new Date().toISOString(),
    }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');
    return NextResponse.redirect(new URL('/app/integracoes?asaas=erro_webhook', req.url), 303);
  }
}
