import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const action = String(f.get('action') || 'create').trim();

  try {
    await enforceRateLimit(admin, `user:${session.user.id}:users-admin`, 20, 3600);
  } catch (error: any) {
    return NextResponse.json({ error: error instanceof SecurityError ? error.message : 'Não foi possível validar a operação.' }, { status: error instanceof SecurityError ? error.status : 503 });
  }

  if (action === 'toggle_status') {
    const targetProfileId = String(f.get('profile_id') || '').trim();
    const nextStatus = String(f.get('status') || '') === 'ativo' ? 'ativo' : 'inativo';
    const { data: target } = await admin.from('profiles')
      .select('id,auth_user_id,email,status')
      .eq('id', targetProfileId)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (!target?.id || !target.auth_user_id) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (String(target.auth_user_id) === String(session.user.id) && nextStatus !== 'ativo') {
      return NextResponse.json({ error: 'Você não pode desativar a própria conta.' }, { status: 400 });
    }

    const { error: profileError } = await admin.from('profiles').update({ status: nextStatus }).eq('id', target.id).eq('law_firm_id', profile.law_firm_id);
    if (profileError) return NextResponse.json({ error: 'Não foi possível alterar o acesso.' }, { status: 400 });

    const { error: authError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: nextStatus === 'ativo' ? 'none' : '876000h',
    });
    if (authError) {
      await admin.from('profiles').update({ status: target.status }).eq('id', target.id).eq('law_firm_id', profile.law_firm_id);
      return NextResponse.json({ error: 'Não foi possível atualizar o bloqueio da conta.' }, { status: 400 });
    }

    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: nextStatus === 'ativo' ? 'user_reactivated' : 'user_deactivated',
      entity: 'profiles', entityId: target.id, req,
      severity: nextStatus === 'ativo' ? 'info' : 'warning',
      metadata: { target_email: target.email },
    });
    return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
  }

  const email = String(f.get('email') || '').trim().toLowerCase();
  const password = String(f.get('password') || '');
  const fullName = String(f.get('full_name') || '').trim();

  const strongPassword = password.length >= 14 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  if (!email || !fullName || !strongPassword) {
    return NextResponse.json({ error: 'Use uma senha provisória com pelo menos 14 caracteres, maiúscula, minúscula, número e símbolo.' }, { status: 400 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
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

  await recordSecurityEvent({ lawFirmId: profile.law_firm_id, authUserId: session.user.id, eventType: 'user_created', entity: 'profiles', entityId: data.user.id, req, metadata: { email } });
  return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
}
