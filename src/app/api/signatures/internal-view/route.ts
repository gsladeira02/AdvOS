import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function POST(req:Request){
 const {profile}=await getCurrentProfile(); const body=await req.json().catch(()=>({})); const requestId=String(body.requestId||'').trim(); const signerId=String(body.signerId||'').trim(); const db=createAdminSupabase();
 const {data:s}=await db.from('signature_signers').select('id,request_id,role').eq('id',signerId).eq('request_id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle();
 if(!s||s.role!=='advogado') return NextResponse.json({ok:false,error:'Acesso não autorizado.'},{status:403});
 await db.from('signature_events').insert({law_firm_id:profile.law_firm_id,request_id:requestId,signer_id:signerId,event_type:'documento_visualizado',metadata:{source:'internal_signature_page',user_id:profile.id}});
 return NextResponse.json({ok:true});
}
