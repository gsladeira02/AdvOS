import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

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
  const payload = await req.json().catch(() => ({}));
  const payment = payload?.payment || payload;
  const admin = createAdminSupabase();
  const externalId = payment?.id;
  const externalReference = payment?.externalReference;

  let installment: any = null;
  if (externalId) {
    const result = await admin
      .from('financial_installments')
      .select('id,law_firm_id')
      .eq('external_id', externalId)
      .maybeSingle();
    installment = result.data;
  }

  if (!installment && externalReference) {
    const result = await admin
      .from('financial_installments')
      .select('id,law_firm_id')
      .eq('id', externalReference)
      .maybeSingle();
    installment = result.data;
  }

  if (installment?.law_firm_id) {
    const { data: config } = await admin
      .from('integration_settings')
      .select('webhook_secret')
      .eq('law_firm_id', installment.law_firm_id)
      .eq('provider', 'asaas')
      .maybeSingle();

    const expected = config?.webhook_secret;
    const received = req.headers.get('asaas-access-token') || '';
    if (expected && received !== expected) {
      return NextResponse.json({ ok: false, error: 'Webhook não autorizado.' }, { status: 401 });
    }
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
    }).eq('id', installment.id);
  }

  await admin.from('webhook_events').insert({
    law_firm_id: installment?.law_firm_id || null,
    provider: 'asaas',
    event_id: payload?.id || externalId || null,
    event_type: payload?.event || payment?.status || null,
    payload,
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
