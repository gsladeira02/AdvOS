import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

async function resolveSignerWithPublicToken(db:any, signerId:string, token:string){
  const resolved=await resolveSignerWithPublicToken(db, signerId, token);
  if(!resolved) return NextResponse.json({ok:false,error:'Assinante inválido.'},{status:404});
  const signer=resolved.signer;
  await db.from('signature_events').insert({law_firm_id:signer.law_firm_id,request_id:signer.request_id,signer_id:signer.id,event_type:'documento_visualizado',metadata:{source:'public_signature_page'}});
  return NextResponse.json({ok:true});
}
