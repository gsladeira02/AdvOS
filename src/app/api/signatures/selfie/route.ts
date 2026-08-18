import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';

async function resolveSignerWithPublicToken(db:any, signerId:string, token:string){
  const {data:signer}=await db.from('signature_signers').select('id,request_id,law_firm_id,name,phone,email,status,role,signer_token,signer_order,cpf,selfie_path,document_photo_path').eq('id',signerId).maybeSingle();
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
  const f=await req.formData(); const token=String(f.get('token')||'').trim(); const signerId=String(f.get('signerId')||'').trim(); const cpf=String(f.get('cpf')||'').replace(/\D/g,''); const selfie=f.get('selfie'); const docPhoto=f.get('document_photo');
  if(!(selfie instanceof File)) return NextResponse.json({ok:false,error:'Selfie não enviada.'},{status:400});
  const admin=createAdminSupabase();
  const resolved=await resolveSignerWithPublicToken(admin, signerId, token);
  if(!resolved) return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
  const s=resolved.signer;
  const {data:r}=await admin.from('signature_requests').select('id,law_firm_id,require_selfie,require_document_photo,expires_at').eq('id',s.request_id).eq('law_firm_id',s.law_firm_id).maybeSingle();
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  const bucket='signature-evidence'; const ext='jpg'; const selfiePath=`${r.law_firm_id}/${r.id}/${signerId}-selfie-${crypto.randomUUID()}.${ext}`;
  const sb=admin.storage.from(bucket); const selfBuf=Buffer.from(await selfie.arrayBuffer());
  if(selfBuf.length>10*1024*1024) return NextResponse.json({ok:false,error:'Selfie muito grande.'},{status:400});
  const up=await sb.upload(selfiePath,selfBuf,{contentType:selfie.type||'image/jpeg',upsert:false}); if(up.error) return NextResponse.json({ok:false,error:up.error.message},{status:400});
  let docPath:string|null=null;
  if(docPhoto instanceof File){const buf=Buffer.from(await docPhoto.arrayBuffer()); if(buf.length>10*1024*1024) return NextResponse.json({ok:false,error:'Documento muito grande.'},{status:400}); docPath=`${r.law_firm_id}/${r.id}/${signerId}-document-${crypto.randomUUID()}.${ext}`; const d=await sb.upload(docPath,buf,{contentType:docPhoto.type||'image/jpeg',upsert:false}); if(d.error) return NextResponse.json({ok:false,error:d.error.message},{status:400});}
  const upd=await admin.from('signature_signers').update({selfie_path:selfiePath,document_photo_path:docPath,cpf:cpf||s.cpf||null}).eq('id',s.id);
  if(upd.error) return NextResponse.json({ok:false,error:'Não foi possível registrar a selfie no cadastro da assinatura: '+upd.error.message},{status:400});
  const ev=await admin.from('signature_events').insert({law_firm_id:r.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'evidencia_facial_recebida',ip:String(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'').split(',')[0].trim(), user_agent:String(req.headers.get('user-agent')||''), has_document:Boolean(docPath), mime:selfie.type, metadata:{selfie_path:selfiePath,cpf:cpf||s.cpf||null}});
  if(ev.error) return NextResponse.json({ok:false,error:'Não foi possível registrar o evento da selfie: '+ev.error.message},{status:400});
  return NextResponse.json({ok:true});
}
