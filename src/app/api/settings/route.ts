import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
function str(v: FormDataEntryValue | null){ return String(v || '').trim(); }

export async function POST(req:Request){
  const {session,profile}=await getCurrentProfile();
  const f=await req.formData();
  const section=str(f.get('section'));
  const admin=createAdminSupabase();

  if(section==='firm'){
    const {error}=await admin.from('law_firms').update({
      name:str(f.get('name')),
      cnpj:str(f.get('cnpj')) || null,
      oab_responsible:str(f.get('oab_responsible')) || null,
      phone:str(f.get('phone')) || null,
      email:str(f.get('email')) || null,
      address:str(f.get('address')) || null
    }).eq('id',profile.law_firm_id);
    if(error) return NextResponse.json({error:error.message},{status:400});
    await admin.from('activity_logs').insert({law_firm_id:profile.law_firm_id,auth_user_id:session.user.id,action:'atualizou_escritorio',entity:'law_firms',entity_id:profile.law_firm_id});
  }

  if(section==='profile'){
    const {error}=await admin.from('profiles').update({
      full_name:str(f.get('full_name')),
      phone:str(f.get('phone')) || null,
      oab_number:str(f.get('oab_number')) || null
    }).eq('id',profile.id).eq('law_firm_id',profile.law_firm_id);
    if(error) return NextResponse.json({error:error.message},{status:400});
    await admin.from('activity_logs').insert({law_firm_id:profile.law_firm_id,auth_user_id:session.user.id,action:'atualizou_perfil',entity:'profiles',entity_id:profile.id});
  }

  if(section==='subscription'){
    const payload={
      plan:str(f.get('plan')) || 'interno',
      status:str(f.get('status')) || 'ativa',
      current_period_end:str(f.get('current_period_end')) || null,
      grace_until:str(f.get('grace_until')) || null
    };
    const {error}=await admin.from('subscriptions').update(payload).eq('law_firm_id',profile.law_firm_id);
    if(error) return NextResponse.json({error:error.message},{status:400});
    await admin.from('activity_logs').insert({law_firm_id:profile.law_firm_id,auth_user_id:session.user.id,action:'atualizou_acesso',entity:'subscriptions'});
  }

  return NextResponse.redirect(new URL('/app/configuracoes',req.url),303);
}
