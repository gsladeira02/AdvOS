import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function clean(v: FormDataEntryValue | null) {
  const value = String(v || '').trim();
  return value || null;
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const f = await req.formData();

  const name = clean(f.get('name'));
  if (!name) return NextResponse.redirect(new URL('/app/clientes?erro=nome', req.url), 303);

  const { error } = await admin.from('clients').insert({
    law_firm_id: profile.law_firm_id,
    name,
    doc: clean(f.get('doc')),
    client_type: clean(f.get('client_type')),
    phone: clean(f.get('phone')),
    whatsapp: clean(f.get('whatsapp')),
    email: clean(f.get('email')),
    address: clean(f.get('address')),
    notes: clean(f.get('notes')),
    service_id: clean(f.get('service_id')),
  });

  if (error) {
    console.error('Erro ao salvar cliente:', error);
    return NextResponse.redirect(new URL(`/app/clientes?erro=${encodeURIComponent(error.message)}`, req.url), 303);
  }

  return NextResponse.redirect(new URL('/app/clientes?salvo=1', req.url), 303);
}
