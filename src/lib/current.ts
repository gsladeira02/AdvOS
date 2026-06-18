import { redirect } from 'next/navigation';
import { createServerSupabase } from './supabase/server';
export async function getCurrentProfile(){const supabase=createServerSupabase(); const {data:{session}}=await supabase.auth.getSession(); if(!session) redirect('/login'); const {data:profile}=await supabase.from('profiles').select('*').eq('auth_user_id',session.user.id).single(); if(!profile) redirect('/login'); return {supabase,session,profile};}
