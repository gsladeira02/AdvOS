import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const email = String(f.get('email') || '').trim().toLowerCase();
  const password = String(f.get('password') || '');
  const fullName = String(f.get('full_name') || '').trim();

  if (!email || !fullName || password.length < 12) {
    return NextResponse.json({ error: 'Informe nome, e-mail e uma senha provisória com pelo menos 12 caracteres.' }, { status: 400 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user?.id) return NextResponse.json({ error: 'Não foi possível criar o usuário.' }, { status: 400 });

  const { error: profileError } = await admin.from('profiles').insert({
    auth_user_id: data.user.id,
    law_firm_id: profile.law_firm_id,
    full_name: fullName,
    email,
    phone: f.get('phone'),
    role: 'membro',
    oab_number: f.get('oab_number'),
    status: 'ativo',
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => null);
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro do usuário.' }, { status: 400 });
  }

  return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
}
