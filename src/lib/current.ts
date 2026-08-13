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

export async function getCurrentProfile(){
  const supabase = await createServerSupabase();
  const user = await getVerifiedUser(supabase);

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // O AdvOS é de um único escritório: usuários sem perfil não recebem
  // estrutura automática nem acesso. Novos acessos devem ser criados pelo administrador.
  if (!profile) redirect('/login?erro=nao-autorizado');
  if (profile.status !== 'ativo') redirect('/login?erro=inativo');

  return { supabase, session: { user }, profile };
}

export async function getCurrentSession(){
  const supabase = await createServerSupabase();
  const user = await getVerifiedUser(supabase);
  return { supabase, session: { user } };
}


export async function getCurrentAdminProfile(){
  const ctx = await getCurrentProfile();
  if (isAdminRole(ctx.profile.role)) return ctx;
  redirect('/app/dashboard?erro=permissao');
}
