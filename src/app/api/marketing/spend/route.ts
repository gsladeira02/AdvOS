import { NextResponse } from 'next/server';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { safeInternalPath } from '@/lib/security';

export const dynamic = 'force-dynamic';

function text(value: FormDataEntryValue | null, max = 500) {
  return String(value || '').trim().slice(0, max);
}
function amount(value: string) {
  const raw = value.trim().replace(/\s/g, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  if (!isAdminRole(profile.role)) return NextResponse.json({ error: 'Apenas administradores podem alterar custos de mídia.' }, { status: 403 });

  const form = await req.formData();
  const redirectTo = safeInternalPath(text(form.get('redirect_to'), 300), '/app/marketing');
  const admin = createAdminSupabase();
  const intent = text(form.get('intent'), 30) || 'create';

  if (intent === 'delete') {
    const id = text(form.get('entry_id'), 80);
    if (!id) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 });
    const { error } = await admin.from('marketing_spend_entries').delete().eq('law_firm_id', profile.law_firm_id).eq('id', id);
    if (error) return NextResponse.json({ error: 'Não foi possível excluir o custo de mídia.' }, { status: 400 });
    return NextResponse.redirect(new URL(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}spend=deleted`, req.url), 303);
  }

  const sourcePlatform = text(form.get('source_platform'), 20);
  const periodStart = text(form.get('period_start'), 10);
  const periodEnd = text(form.get('period_end'), 10);
  const value = amount(text(form.get('amount'), 40));
  if (!['meta', 'google'].includes(sourcePlatform)) return NextResponse.json({ error: 'Plataforma inválida.' }, { status: 400 });
  if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
  if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: 'Informe um valor válido.' }, { status: 400 });

  const { error } = await admin.from('marketing_spend_entries').insert({
    law_firm_id: profile.law_firm_id,
    source_platform: sourcePlatform,
    period_start: periodStart,
    period_end: periodEnd,
    campaign_id: text(form.get('campaign_id'), 180) || null,
    campaign_name: text(form.get('campaign_name'), 240) || null,
    ad_id: text(form.get('ad_id'), 180) || null,
    ad_name: text(form.get('ad_name'), 240) || null,
    amount: value,
    notes: text(form.get('notes'), 1000) || null,
    created_by: session.user.id,
  });
  if (error) return NextResponse.json({ error: 'Não foi possível registrar o custo de mídia.' }, { status: 400 });

  return NextResponse.redirect(new URL(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}spend=saved`, req.url), 303);
}
