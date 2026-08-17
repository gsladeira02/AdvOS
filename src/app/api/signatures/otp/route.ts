import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppTemplate, sendWhatsAppText, getWhatsAppConfig } from '@/lib/whatsappApi';
const sha256=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
async function resolveSignerWithPublicToken(db:any, signerId:string, token:string){
  const {data:signer}=await db.from('signature_signers').select('id,request_id,law_firm_id,name,phone,email,status,role,signer_token,signer_order').eq('id',signerId).maybeSingle();
  if(!signer) return null;
  const {data:req}=await db.from('signature_requests').select('id,law_firm_id,public_token,status,expires_at,require_selfie,require_document_photo,require_otp').eq('id',signer.request_id).maybeSingle();
  if(!req) return null;
  const t=String(token||'').trim();
  const publicOk=String(req.public_token||'').trim()===t;
  const legacyOk=String(signer.signer_token||'').trim()===t;
  if(!publicOk && !legacyOk) return null;
  if(String(signer.role||'').toLowerCase()==='advogado') return null;
  if(Number(signer.signer_order)!==1) return null;
  return {signer,request:req};
}

export async function POST(req:Request){
  const body=await req.json(); const token=String(body.token||'').trim(); const signerId=String(body.signerId||'').trim();
  const admin=createAdminSupabase();
  const resolved=await resolveSignerWithPublicToken(admin, signerId, token);
  if(!resolved) return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
  const signer=resolved.signer;
  const r=resolved.request;
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  if(!signer.phone) return NextResponse.json({ok:false,error:'O signatário não possui telefone para receber o código.'},{status:400});
  const otp=String(crypto.randomInt(100000,999999));
  await admin.from('signature_signers').update({otp_hash:sha256(otp),otp_expires_at:new Date(Date.now()+10*60*1000).toISOString()}).eq('id',signer.id);
  const otpMessage=`Seu código de assinatura do AdvOS é ${otp}. Ele expira em 10 minutos. Não compartilhe este código.`;
  const config=await getWhatsAppConfig(signer.law_firm_id);
  const raw=(config.row?.raw_settings||{}) as Record<string,any>;
  const configuredTemplate=String(raw.signature_otp_template_name||process.env.WHATSAPP_SIGNATURE_OTP_TEMPLATE||'').trim();
  let sentAs='text';
  try{
    await sendWhatsAppText({lawFirmId:signer.law_firm_id,to:signer.phone,message:otpMessage,sentBy:null,clientId:null});
  }catch(error:any){
    const normalized=String(error?.message||'').toLowerCase();
    const outside24h=normalized.includes('24 hours')||normalized.includes('24 horas')||normalized.includes('janela de atendimento')||normalized.includes('outside the allowed window');
    if(!configuredTemplate || !outside24h) throw error;
    await sendWhatsAppTemplate({
      lawFirmId:signer.law_firm_id,
      to:signer.phone,
      templateName:configuredTemplate,
      language:String(raw.signature_otp_template_language||'pt_BR'),
      parameters:[otp],
      renderedBody:otpMessage,
      clientId:null,
      sentBy:null,
    });
    sentAs='template';
  }
  await admin.from('signature_events').insert({law_firm_id:signer.law_firm_id,request_id:r.id,signer_id:signer.id,event_type:'otp_enviado_pela_api_whatsapp',metadata:{sent_as:sentAs}});
  return NextResponse.json({ok:true,sent_as:sentAs});
}
