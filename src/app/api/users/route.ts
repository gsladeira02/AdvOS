import { NextResponse } from 'next/server';
import { getCurrentAdminProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

function validPassword(password: string) {
  // V9.55: mínimo de 6 caracteres e somente letras/números.
  // São válidas senhas só com letras, só com números ou uma combinação dos dois.
  return /^[A-Za-z0-9]{6,}$/.test(password);
}

function normalizeRole(value: FormDataEntryValue | null) {
  return String(value || '').trim().toLowerCase() === 'administrador' ? 'administrador' : 'membro';
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const action = String(f.get('action') || 'create').trim();

  try {
    await enforceRateLimit(admin, `user:${session.user.id}:users-admin`, 30, 3600);
  } catch (error: any) {
    return NextResponse.json({ error: error instanceof SecurityError ? error.message : 'Não foi possível validar a operação.' }, { status: error instanceof SecurityError ? error.status : 503 });
  }

  if (action === 'toggle_status') {
    const targetProfileId = String(f.get('profile_id') || '').trim();
    const nextStatus = String(f.get('status') || '') === 'ativo' ? 'ativo' : 'inativo';
    const { data: target } = await admin.from('profiles')
      .select('id,auth_user_id,email,status,role')
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
      metadata: { target_email: target.email, target_role: target.role },
    });
    return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
  }

  if (action === 'set_role') {
    const targetProfileId = String(f.get('profile_id') || '').trim();
    const nextRole = normalizeRole(f.get('role'));
    const { data: target } = await admin.from('profiles')
      .select('id,auth_user_id,email,role,status')
      .eq('id', targetProfileId)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (!target?.id || !target.auth_user_id) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

    // Evita que o administrador que está operando o painel remova o próprio acesso administrativo.
    if (String(target.auth_user_id) === String(session.user.id) && nextRole !== 'administrador') {
      return NextResponse.json({ error: 'Você não pode remover o próprio perfil de administrador.' }, { status: 400 });
    }

    const { error } = await admin.from('profiles')
      .update({ role: nextRole })
      .eq('id', target.id)
      .eq('law_firm_id', profile.law_firm_id);

    if (error) return NextResponse.json({ error: 'Não foi possível alterar o perfil de acesso.' }, { status: 400 });

    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: nextRole === 'administrador' ? 'user_promoted_admin' : 'user_demoted_member',
      entity: 'profiles', entityId: target.id, req,
      severity: nextRole === 'administrador' ? 'warning' : 'info',
      metadata: { target_email: target.email, previous_role: target.role, new_role: nextRole },
    });

    return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
  }

  const email = String(f.get('email') || '').trim().toLowerCase();
  const password = String(f.get('password') || '');
  const fullName = String(f.get('full_name') || '').trim();
  const role = normalizeRole(f.get('role'));

  if (!email || !fullName || !validPassword(password)) {
    return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres e conter somente letras e números.' }, { status: 400 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user?.id) {
    const passwordRejected = /password|senha/i.test(String(error?.message || ''));
    return NextResponse.json({
      error: passwordRejected
        ? 'A senha foi recusada pelo provedor de autenticação. Verifique se o mínimo de senha do Supabase também está configurado para 6 caracteres.'
        : 'Não foi possível criar o usuário.',
    }, { status: 400 });
  }

  const { error: profileError } = await admin.from('profiles').insert({
    auth_user_id: data.user.id,
    law_firm_id: profile.law_firm_id,
    full_name: fullName,
    email,
    phone: f.get('phone'),
    role,
    oab_number: f.get('oab_number'),
    status: 'ativo',
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => null);
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro do usuário.' }, { status: 400 });
  }

  await recordSecurityEvent({
    lawFirmId: profile.law_firm_id,
    authUserId: session.user.id,
    eventType: 'user_created',
    entity: 'profiles', entityId: data.user.id, req,
    metadata: { email, role },
  });
  return NextResponse.redirect(new URL('/app/usuarios', req.url), 303);
}
