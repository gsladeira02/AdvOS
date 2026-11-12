import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function redirect(req: Request, clientId: string, success: boolean) {
  const url = new URL('/app/clientes/' + encodeURIComponent(clientId), req.url);
  url.searchParams.set(success ? 'resumo_contrato' : 'resumo_contrato_erro', success ? 'salvo' : '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const clientId = String(form.get('client_id') || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 });
  }

  const rawAmount = String(form.get('contract_total_amount') || '').trim();
  const rawCount = String(form.get('contract_installment_count') || '').trim();
  const amount = rawAmount ? Number(rawAmount) : null;
  const count = rawCount ? Number(rawCount) : null;

  if ((amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001))
    || (count !== null && (!Number.isInteger(count) || count < 0 || count > 120))) {
    return redirect(req, clientId, false);
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.from('clients')
    .update({
      contract_total_amount: amount,
      contract_installment_count: count,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Erro ao salvar condições financeiras do contrato:', error.code);
    return redirect(req, clientId, false);
  }
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  return redirect(req, clientId, true);
}
