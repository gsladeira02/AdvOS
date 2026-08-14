import { redirect } from 'next/navigation';
import { createServerSupabase } from './supabase/server';
import { createAdminSupabase } from './supabase/admin';

const ADMIN_ROLES = new Set(['admin', 'administrador', 'proprietario', 'proprietário']);

export function isAdminRole(role?: string | null) {
  return ADMIN_ROLES.has(String(role || '').trim().toLowerCase());
}

async function getVerifiedUser(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  return user;
}

async function requireAal2(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) redirect('/login?erro=mfa');

  if (data?.currentLevel === 'aal2') return;
  if (data?.nextLevel === 'aal2') redirect('/auth/mfa');
  redirect('/auth/mfa/setup');
}

export async function getCurrentProfile(){
  const supabase = await createServerSupabase();
  const user = await getVerifiedUser(supabase);

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Usuários sem perfil nunca recebem acesso por estarem presentes no Supabase Auth.
  if (!profile) redirect('/login?erro=nao-autorizado');
  if (profile.status !== 'ativo') redirect('/login?erro=inativo');

  // V9.39: qualquer tela/endpoint interno só prossegue com MFA concluído (AAL2).
  // As rotas /auth/mfa e /auth/mfa/setup não usam este helper e continuam
  // acessíveis com AAL1 para permitir a configuração/desafio do segundo fator.
  await requireAal2(supabase);

  return { supabase, session: { user }, profile };
}

export async function getCurrentSession(){
  const supabase = await createServerSupabase();
  const user = await getVerifiedUser(supabase);
  await requireAal2(supabase);
  return { supabase, session: { user } };
}

export async function getCurrentAdminProfile(){
  const ctx = await getCurrentProfile();
  if (isAdminRole(ctx.profile.role)) return ctx;
  redirect('/app/dashboard?erro=permissao');
}
