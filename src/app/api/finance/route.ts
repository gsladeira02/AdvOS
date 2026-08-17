import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

const ALLOWED_STATUS = new Set(['pendente', 'atrasado', 'pago']);

function todayBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const amount = Number(f.get('amount') || 0);
  const requestedStatus = String(f.get('status') || 'pendente').trim();
  const status = ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : 'pendente';
  const paymentMethod = String(f.get('payment_method') || '').trim() || null;
  const redirectTo = String(f.get('redirect_to') || '/app/financeiro').trim();

  const { data: contract, error: contractError } = await admin.from('financial_contracts').insert({
    law_firm_id: profile.law_firm_id,
    client_id: f.get('client_id') || null,
    description: f.get('description'),
    total_amount: Number.isFinite(amount) ? amount : 0,
    status: 'ativo',
  }).select('id').single();

  if (contractError || !contract?.id) {
    return NextResponse.json({ error: 'Não foi possível criar o contrato financeiro.' }, { status: 400 });
  }

  const { error: installmentError } = await admin.from('financial_installments').insert({
    law_firm_id: profile.law_firm_id,
    contract_id: contract.id,
    amount: Number.isFinite(amount) ? amount : 0,
    due_date: f.get('due_date') || null,
    status,
    paid_at: status === 'pago' ? todayBrazil() : null,
    payment_method: paymentMethod,
  });

  if (installmentError) return NextResponse.json({ error: 'Não foi possível criar a parcela.' }, { status: 400 });
  const safeRedirect = redirectTo.startsWith('/app/') ? redirectTo : '/app/financeiro';
  return NextResponse.redirect(new URL(safeRedirect, req.url), 303);
}
