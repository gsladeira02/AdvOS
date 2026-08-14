import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const ALLOWED_STATUS = new Set(['pendente', 'atrasado', 'pago']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 32768);
    const installmentId = String(body.installmentId || body.id || '').trim();
    const status = String(body.status || '').trim();

    if (!UUID_RE.test(installmentId)) throw new SecurityError('Cobrança inválida.', 400);
    if (!ALLOWED_STATUS.has(status)) throw new SecurityError('Status financeiro inválido.', 400);

    const admin = createAdminSupabase();
    const { data: current, error: currentError } = await admin
      .from('financial_installments')
      .select('id,status,paid_at,amount')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', installmentId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current?.id) throw new SecurityError('Cobrança não encontrada.', 404);

    const updates: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'pago') updates.paid_at = current.paid_at || todayBrazil();
    else updates.paid_at = null;

    const { data: updated, error } = await admin
      .from('financial_installments')
      .update(updates)
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', installmentId)
      .select('id,status,paid_at,amount,due_date,updated_at')
      .single();

    if (error) throw error;

    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: 'finance.installment_status_changed',
      entity: 'financial_installment',
      entityId: installmentId,
      req,
      metadata: { from: current.status, to: status, amount: Number(current.amount || 0) },
    });

    return NextResponse.json({ ok: true, installment: updated });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível alterar o status da cobrança.') }, { status });
  }
}
