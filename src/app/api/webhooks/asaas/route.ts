import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, safeEqual, SecurityError } from '@/lib/security';

function mapWebhookStatus(event?: string, status?: string) {
  const e = String(event || '').toUpperCase();
  const s = String(status || '').toUpperCase();
  if (e.includes('RECEIVED') || e.includes('CONFIRMED') || ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(s)) return 'pago';
  if (e.includes('OVERDUE') || s === 'OVERDUE') return 'atrasado';
  if (e.includes('DELETED') || e.includes('REFUNDED')) return 'cancelado';
  return 'pendente';
}

function linkPayload(payment: any) {
  return {
    payment_url: payment?.paymentLink || payment?.invoiceUrl || null,
    invoice_url: payment?.invoiceUrl || null,
    bank_slip_url: payment?.bankSlipUrl || null,
    pix_qr_code: payment?.pixQrCode || payment?.encodedImage || null,
    pix_payload: payment?.pixCopyPaste || payment?.payload || null,
  };
}

export async function POST(req: Request) {
  try {
    const receivedToken = req.headers.get('asaas-access-token') || '';
    if (!receivedToken) return NextResponse.json({ ok: false, error: 'Webhook não autorizado.' }, { status: 401 });

    const admin = createAdminSupabase();
    const { data: configs } = await admin
      .from('integration_settings')
      .select('law_firm_id,webhook_secret')
      .eq('provider', 'asaas')
      .eq('enabled', true);

    const config = (configs || []).find((row: any) => safeEqual(receivedToken, row.webhook_secret));
    if (!config?.law_firm_id) {
      return NextResponse.json({ ok: false, error: 'Webhook não autorizado.' }, { status: 401 });
    }

    const payload: any = await readJsonBody(req, 1024 * 1024);
    const payment = payload?.payment || payload;
    const externalId = String(payment?.id || '').trim();
    const externalReference = String(payment?.externalReference || '').trim();

    let installment: any = null;
    if (externalId) {
      const result = await admin
        .from('financial_installments')
        .select('id,law_firm_id')
        .eq('law_firm_id', config.law_firm_id)
        .eq('external_id', externalId)
        .maybeSingle();
      installment = result.data;
    }

    if (!installment && externalReference) {
      const result = await admin
        .from('financial_installments')
        .select('id,law_firm_id')
        .eq('law_firm_id', config.law_firm_id)
        .eq('id', externalReference)
        .maybeSingle();
      installment = result.data;
    }

    const status = mapWebhookStatus(payload?.event, payment?.status);

    if (installment) {
      await admin.from('financial_installments').update({
        status,
        provider: 'asaas',
        external_id: externalId || null,
        integration_status: 'webhook_atualizado',
        paid_at: status === 'pago' ? new Date().toISOString().slice(0, 10) : null,
        ...linkPayload(payment),
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      }).eq('id', installment.id).eq('law_firm_id', config.law_firm_id);
    }

    await admin.from('webhook_events').insert({
      law_firm_id: config.law_firm_id,
      provider: 'asaas',
      event_id: payload?.id || externalId || null,
      event_type: payload?.event || payment?.status || null,
      payload,
      processed_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: 'Webhook inválido.' }, { status });
  }
}
