import { redirect } from 'next/navigation';
import { createServerSupabase } from './supabase/server';
import { createAdminSupabase } from './supabase/admin';

function isoDatePlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getCurrentProfile(){
  const supabase=await createServerSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) redirect('/login');

  let {data:profile}=await supabase.from('profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle();

  // V6: o usuário pode entrar em todas as abas sem preencher os dados cadastrais.
  // Se ainda não existir escritório/perfil, criamos uma estrutura interna mínima automaticamente.
  if(!profile){
    const admin=createAdminSupabase();
    const existing=await admin.from('profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle();
    if(existing.data){
      profile=existing.data;
    }else{
      const email=session.user.email || 'usuario@advos.local';
      const {data:firm,error:firmError}=await admin.from('law_firms').insert({
        name:'Escritório sem cadastro',
        email,
        status:'ativo'
      }).select('id').single();
      if(firmError) throw new Error(`Não foi possível criar o escritório interno: ${firmError.message}`);

      await admin.from('subscriptions').insert({
        law_firm_id:firm.id,
        plan:'interno',
        status:'ativa',
        current_period_start:new Date().toISOString().slice(0,10),
        current_period_end:isoDatePlus(365),
        grace_until:isoDatePlus(368)
      });

      const {data:newProfile,error:profileError}=await admin.from('profiles').insert({
        auth_user_id:session.user.id,
        law_firm_id:firm.id,
        full_name:email.split('@')[0] || 'Usuário AdvOS',
        email,
        role:'membro',
        status:'ativo'
      }).select('*').single();
      if(profileError) throw new Error(`Não foi possível criar o perfil interno: ${profileError.message}`);

      await admin.from('activity_logs').insert({law_firm_id:firm.id,auth_user_id:session.user.id,action:'bootstrap_automatico',entity:'law_firms',entity_id:firm.id});
      profile=newProfile;
    }
  }

  return {supabase,session,profile};
}

export async function getCurrentSession(){
  const supabase=await createServerSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) redirect('/login');
  return {supabase,session};
}
