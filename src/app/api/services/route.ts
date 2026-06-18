import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function num(v: FormDataEntryValue | null) {
  const n = Number(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function clean(v: FormDataEntryValue | null) {
  const value = String(v || '').trim();
  return value || null;
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const f = await req.formData();

  const name = clean(f.get('name'));
  if (!name) {
    return NextResponse.redirect(new URL('/app/servicos?erro=nome', req.url), 303);
  }

  const { error } = await admin.from('legal_services').insert({
    law_firm_id: profile.law_firm_id,
    name,
    description: clean(f.get('description')),
    default_amount: num(f.get('default_amount')),
    active: String(f.get('active') || 'true') === 'true',
  });

  if (error) {
    console.error('Erro ao salvar serviço:', error);
    return NextResponse.redirect(new URL(`/app/servicos?erro=${encodeURIComponent(error.message)}`, req.url), 303);
  }

  return NextResponse.redirect(new URL('/app/servicos?salvo=1', req.url), 303);
}
