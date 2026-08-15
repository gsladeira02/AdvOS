import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppText } from '@/lib/whatsappApi';

const sha256=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
export async function POST(req:Request){
  const body=await req.json(); const token=String(body.token||'').trim();
  const admin=createAdminSupabase();
  const {data:requestRow}=await admin.from('signature_requests').select('id,law_firm_id,status,expires_at,require_otp').eq('public_token',token).maybeSingle();
  if(!requestRow) return NextResponse.json({ok:false,error:'Link inválido.'},{status:404});
  if(requestRow.expires_at && new Date(requestRow.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  const {data:signer}=await admin.from('signature_signers').select('id,name,phone,email').eq('request_id',requestRow.id).order('created_at').limit(1).maybeSingle();
  if(!signer) return NextResponse.json({ok:false,error:'Signatário não encontrado.'},{status:404});
  if(!signer.phone) return NextResponse.json({ok:false,error:'O signatário não possui telefone para receber o código.'},{status:400});
  const otp=String(crypto.randomInt(100000,999999));
  await admin.from('signature_signers').update({otp_hash:sha256(otp),otp_expires_at:new Date(Date.now()+10*60*1000).toISOString()}).eq('id',signer.id);
  await sendWhatsAppText({lawFirmId:requestRow.law_firm_id,to:signer.phone,message:`Seu código de assinatura do AdvOS é ${otp}. Ele expira em 10 minutos. Não compartilhe este código.`,sentBy:null,clientId:null});
  await admin.from('signature_events').insert({law_firm_id:requestRow.law_firm_id,request_id:requestRow.id,signer_id:signer.id,event_type:'otp_enviado'});
  return NextResponse.json({ok:true});
}
