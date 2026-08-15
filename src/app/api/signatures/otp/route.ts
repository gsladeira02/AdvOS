import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppText } from '@/lib/whatsappApi';
const sha256=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
export async function POST(req:Request){
  const body=await req.json(); const token=String(body.token||'').trim(); const signerId=String(body.signerId||'').trim();
  const admin=createAdminSupabase();
  const {data:signer}=await admin.from('signature_signers').select('id,request_id,law_firm_id,name,phone').eq('id',signerId).eq('signer_token',token).maybeSingle();
  if(!signer) return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
  const {data:r}=await admin.from('signature_requests').select('id,status,expires_at,require_otp').eq('id',signer.request_id).maybeSingle();
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  if(!signer.phone) return NextResponse.json({ok:false,error:'O signatário não possui telefone para receber o código.'},{status:400});
  const otp=String(crypto.randomInt(100000,999999));
  await admin.from('signature_signers').update({otp_hash:sha256(otp),otp_expires_at:new Date(Date.now()+10*60*1000).toISOString()}).eq('id',signer.id);
  await sendWhatsAppText({lawFirmId:signer.law_firm_id,to:signer.phone,message:`Seu código de assinatura do AdvOS é ${otp}. Ele expira em 10 minutos. Não compartilhe este código.`,sentBy:null,clientId:null});
  await admin.from('signature_events').insert({law_firm_id:signer.law_firm_id,request_id:r.id,signer_id:signer.id,event_type:'otp_enviado_pela_api_whatsapp'});
  return NextResponse.json({ok:true});
}
