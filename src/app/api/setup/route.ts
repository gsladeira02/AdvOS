import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

function str(v: FormDataEntryValue | null){ return String(v || '').trim(); }
function num(v: FormDataEntryValue | null, fallback:number){ const n=Number(v); return Number.isFinite(n) && n>0 ? n : fallback; }

export async function POST(req:Request){
  const supabase=await createServerSupabase();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return NextResponse.json({error:'Faça login antes de configurar o AdvOS.'},{status:401});

  const admin=createAdminSupabase();
  const existing=await admin.from('profiles').select('id').eq('auth_user_id',session.user.id).maybeSingle();
  if(existing.data) return NextResponse.json({error:'Este usuário já possui perfil configurado.'},{status:400});

  const f=await req.formData();
  const firmName=str(f.get('firm_name'));
  const fullName=str(f.get('full_name'));
  if(!firmName || !fullName) return NextResponse.json({error:'Informe o nome do escritório e o nome do usuário.'},{status:400});

  const days=num(f.get('days'),365);
  const graceDays=Number(f.get('grace_days')||3);
  const today=new Date();
  const periodEnd=new Date(today); periodEnd.setDate(periodEnd.getDate()+days);
  const graceUntil=new Date(periodEnd); graceUntil.setDate(graceUntil.getDate()+(Number.isFinite(graceDays)?graceDays:3));
  const iso=(d:Date)=>d.toISOString().slice(0,10);

  const {data:firm,error:firmError}=await admin.from('law_firms').insert({
    name:firmName,
    cnpj:str(f.get('cnpj')) || null,
    oab_responsible:str(f.get('oab_responsible')) || null,
    phone:str(f.get('firm_phone')) || null,
    email:str(f.get('firm_email')) || session.user.email,
    address:str(f.get('address')) || null,
    status:'ativo'
  }).select('id').single();
  if(firmError) return NextResponse.json({error:firmError.message},{status:400});

  const lawFirmId=firm.id;
  const sub=await admin.from('subscriptions').insert({
    law_firm_id:lawFirmId,
    plan:str(f.get('plan')) || 'interno',
    status:'ativa',
    current_period_start:iso(today),
    current_period_end:iso(periodEnd),
    grace_until:iso(graceUntil)
  });
  if(sub.error) return NextResponse.json({error:sub.error.message},{status:400});

  const profile=await admin.from('profiles').insert({
    auth_user_id:session.user.id,
    law_firm_id:lawFirmId,
    full_name:fullName,
    email:session.user.email,
    phone:str(f.get('phone')) || null,
    role:'membro',
    oab_number:str(f.get('oab_number')) || null,
    status:'ativo'
  });
  if(profile.error) return NextResponse.json({error:profile.error.message},{status:400});

  await admin.from('activity_logs').insert({law_firm_id:lawFirmId,auth_user_id:session.user.id,action:'configuracao_inicial',entity:'law_firms',entity_id:lawFirmId});
  return NextResponse.redirect(new URL('/app/dashboard', req.url), 303);
}
