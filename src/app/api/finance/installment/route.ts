import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PAYMENT_METHODS = new Set([
  '', 'nao_definido', 'pix', 'boleto', 'cartao_credito', 'cartao_debito',
  'transferencia', 'dinheiro', 'cliente_escolhe', 'outro',
]);

function clean(value: any) {
  return String(value || '').trim();
}

async function maybeDeleteEmptyManualContract(admin: any, lawFirmId: string, contractId: string) {
  const { count } = await admin
    .from('financial_installments')
    .select('id', { count: 'exact', head: true })
    .eq('law_firm_id', lawFirmId)
    .eq('contract_id', contractId);

  if (Number(count || 0) > 0) return false;

  // Contratos gerados por documento devem permanecer, mesmo sem cobrança.
  const { count: generatedCount } = await admin
    .from('generated_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('law_firm_id', lawFirmId)
    .eq('financial_contract_id', contractId);

  if (Number(generatedCount || 0) > 0) return false;

  const { error } = await admin
    .from('financial_contracts')
    .delete()
    .eq('law_firm_id', lawFirmId)
    .eq('id', contractId);

  if (error) throw error;
  return true;
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 32768);
    const installmentId = clean(body.installmentId || body.id);
    const action = clean(body.action || 'update');

    if (!UUID_RE.test(installmentId)) throw new SecurityError('Cobrança inválida.', 400);

    const admin = createAdminSupabase();
    const { data: current, error: currentError } = await admin
      .from('financial_installments')
      .select('id,contract_id,amount,status,payment_method,billing_type,provider,external_id')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', installmentId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current?.id) throw new SecurityError('Cobrança não encontrada.', 404);

    if (action === 'delete') {
      const { error } = await admin
        .from('financial_installments')
        .delete()
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', installmentId);
      if (error) throw error;

      const contractDeleted = current.contract_id
        ? await maybeDeleteEmptyManualContract(admin, profile.law_firm_id, String(current.contract_id))
        : false;

      await recordSecurityEvent({
        lawFirmId: profile.law_firm_id,
        authUserId: session.user.id,
        eventType: 'finance.installment_deleted',
        entity: 'financial_installment',
        entityId: installmentId,
        req,
        metadata: {
          amount: Number(current.amount || 0),
          status: current.status || null,
          provider: current.provider || null,
          external_id: current.external_id || null,
          empty_contract_deleted: contractDeleted,
        },
      });

      return NextResponse.json({ ok: true, deleted: true, contractDeleted });
    }

    const paymentMethod = clean(body.paymentMethod || body.payment_method);
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new SecurityError('Forma de pagamento inválida.', 400);

    const { data: updated, error } = await admin
      .from('financial_installments')
      .update({ payment_method: paymentMethod || null, updated_at: new Date().toISOString() })
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', installmentId)
      .select('id,payment_method,updated_at')
      .single();
    if (error) throw error;

    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: 'finance.payment_method_changed',
      entity: 'financial_installment',
      entityId: installmentId,
      req,
      metadata: { from: current.payment_method || null, to: paymentMethod || null },
    });

    return NextResponse.json({ ok: true, installment: updated });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível atualizar a cobrança.') }, { status });
  }
}
