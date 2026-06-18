import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

function mapWebhookStatus(event?: string, status?: string) {
  const e = String(event || '').toUpperCase();
  const s = String(status || '').toUpperCase();
  if (e.includes('RECEIVED') || ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(s)) return 'pago';
  if (e.includes('OVERDUE') || s === 'OVERDUE') return 'atrasado';
  return 'pendente';
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

  const status = mapWebhookStatus(payload?.event, payment?.status);

  if (installment) {
    await admin.from('financial_installments').update({
      status,
      provider: 'asaas',
      external_id: externalId || null,
      integration_status: 'webhook_atualizado',
      paid_at: status === 'pago' ? new Date().toISOString().slice(0, 10) : null,
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
