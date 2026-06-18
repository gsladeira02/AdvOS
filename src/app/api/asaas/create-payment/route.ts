import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

function onlyNumbers(v?: string | null) {
  return String(v || '').replace(/\D/g, '');
}

function mapAsaasStatus(status?: string) {
  const s = String(status || '').toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(s)) return 'pago';
  if (s === 'OVERDUE') return 'atrasado';
  return 'pendente';
}

async function asaasFetch(baseUrl: string, token: string, path: string, body: any) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AdvOS',
      access_token: token,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.errors?.[0]?.description || json?.message || 'Erro na API do Asaas.';
    throw new Error(message);
  }
  return json;
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const f = await req.formData();
  const installmentId = str(f.get('installment_id'));
  const billingType = str(f.get('billingType')) || 'BOLETO';
  const admin = createAdminSupabase();

  const { data: installment } = await admin
    .from('financial_installments')
    .select('*, financial_contracts(id,description,clients(id,name,doc,email,phone,whatsapp,asaas_customer_id))')
    .eq('id', installmentId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!installment) return NextResponse.json({ error: 'Parcela não encontrada.' }, { status: 404 });

  const client = installment.financial_contracts?.clients;
  if (!client?.name) return NextResponse.json({ error: 'Vincule um cliente antes de gerar a cobrança.' }, { status: 400 });

  const config = await getIntegrationConfig(profile.law_firm_id, 'asaas');
  if (!config.configured) {
    await admin.from('financial_installments').update({ provider: 'asaas', integration_status: 'configuracao_pendente' }).eq('id', installment.id);
    return NextResponse.redirect(new URL('/app/financeiro?asaas=configuracao', req.url), 303);
  }

  try {
    let customerId = client.asaas_customer_id;

    if (!customerId) {
      const customer = await asaasFetch(config.baseUrl, config.token, '/customers', {
        name: client.name,
        cpfCnpj: onlyNumbers(client.doc) || undefined,
        email: client.email || undefined,
        mobilePhone: onlyNumbers(client.whatsapp || client.phone) || undefined,
        externalReference: client.id,
      });
      customerId = customer.id;
      await admin.from('clients').update({ asaas_customer_id: customerId }).eq('id', client.id).eq('law_firm_id', profile.law_firm_id);
    }

    const dueDate = installment.due_date || new Date().toISOString().slice(0, 10);
    const payment = await asaasFetch(config.baseUrl, config.token, '/payments', {
      customer: customerId,
      billingType: billingType || config.defaultBillingType,
      dueDate,
      value: Number(installment.amount || 0),
      description: installment.financial_contracts?.description || 'Honorários advocatícios',
      externalReference: installment.id,
    });

    await admin.from('financial_installments').update({
      provider: 'asaas',
      external_id: payment.id,
      integration_status: 'criada',
      status: mapAsaasStatus(payment.status),
      payment_url: payment.paymentLink || payment.invoiceUrl || null,
      invoice_url: payment.invoiceUrl || null,
      bank_slip_url: payment.bankSlipUrl || null,
      billing_type: payment.billingType || billingType,
      raw_payload: payment,
      updated_at: new Date().toISOString(),
    }).eq('id', installment.id).eq('law_firm_id', profile.law_firm_id);

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'criou_cobranca_asaas',
      entity: 'financial_installments',
      entity_id: installment.id,
    });
  } catch (error: any) {
    await admin.from('financial_installments').update({
      provider: 'asaas',
      integration_status: 'erro',
      raw_payload: { message: error?.message || 'Erro desconhecido' },
      updated_at: new Date().toISOString(),
    }).eq('id', installment.id).eq('law_firm_id', profile.law_firm_id);
  }

  return NextResponse.redirect(new URL('/app/financeiro', req.url), 303);
}
