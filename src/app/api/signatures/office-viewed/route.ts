import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function POST(req:Request){
  const {profile}=await getCurrentAdminProfile(); const body=await req.json().catch(()=>({})); const requestId=String(body?.requestId||'').trim();
  if(!requestId)return NextResponse.json({ok:false,error:'Solicitação não informada.'},{status:400});
  const db=createAdminSupabase();
  const {data:s}=await db.from('signature_signers').select('id,law_firm_id,signer_order,status').eq('request_id',requestId).eq('law_firm_id',profile.law_firm_id).eq('signer_order',2).maybeSingle();
  if(!s)return NextResponse.json({ok:false,error:'Assinatura do escritório não encontrada.'},{status:404});
  const now=new Date().toISOString(); await db.from('signature_signers').update({viewed_at:now}).eq('id',s.id);
  await db.from('signature_events').insert({law_firm_id:profile.law_firm_id,request_id:requestId,signer_id:s.id,event_type:'documento_visualizado_escritorio',metadata:{user_id:profile.id}});
  return NextResponse.json({ok:true,viewedAt:now});
}
