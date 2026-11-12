import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const fields = { naturalidade: 120, civil_status: 120, profession: 160, rg: 40, rg_uf: 60 } as const;

function redirect(req: Request, clientId: string, ok: boolean) {
  const url = new URL('/app/clientes/' + encodeURIComponent(clientId), req.url);
  url.searchParams.set(ok ? 'qualificacao' : 'qualificacao_erro', ok ? 'salva' : '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const clientId = String(form.get('client_id') || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId))
    return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 });

  const update: Record<string, string | null> = {};
  for (const [key, max] of Object.entries(fields)) {
    const value = form.get(key);
    if (value instanceof File) return redirect(req, clientId, false);
    const clean = String(value || '').trim();
    if (clean.length > max) return redirect(req, clientId, false);
    update[key] = clean || null;
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.from('clients')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('Erro ao atualizar qualificação do cliente:', error.code);
    return redirect(req, clientId, false);
  }
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  return redirect(req, clientId, true);
}
