import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function POST(req:Request){
  const body=await req.json().catch(()=>({})); const token=String(body.token||'').trim(); const signerId=String(body.signerId||'').trim();
  const db=createAdminSupabase();
  const {data:signer}=await db.from('signature_signers').select('id,request_id,law_firm_id,signer_token,status').eq('id',signerId).eq('signer_token',token).maybeSingle();
  if(!signer) return NextResponse.json({ok:false,error:'Assinante inválido.'},{status:404});
  await db.from('signature_events').insert({law_firm_id:signer.law_firm_id,request_id:signer.request_id,signer_id:signer.id,event_type:'documento_visualizado',metadata:{source:'public_signature_page'}});
  return NextResponse.json({ok:true});
}
