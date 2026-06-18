import { redirect } from 'next/navigation';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { createServerSupabase } from './supabase/server';

export async function getCurrentProfile(){
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) redirect('/login');
  const supabase=await createServerSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) redirect('/login');
  const {data:profile}=await supabase.from('profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle();
  if(!profile) redirect('/app/configuracoes');
  return {supabase,session,profile};
}

export async function getCurrentSession(){
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) redirect('/login');
  const supabase=await createServerSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) redirect('/login');
  return {supabase,session};
}
