import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const amount = Number(f.get('amount') || 0);

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
    due_date: f.get('due_date'),
    status: f.get('status'),
  });

  if (installmentError) return NextResponse.json({ error: 'Não foi possível criar a parcela.' }, { status: 400 });
  return NextResponse.redirect(new URL('/app/financeiro', req.url), 303);
}
