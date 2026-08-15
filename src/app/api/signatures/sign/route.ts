import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createAdminSupabase } from '@/lib/supabase/admin';
const sha256=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export async function POST(req:Request){
  const f=await req.formData(); const token=String(f.get('token')||'').trim(); const signerId=String(f.get('signerId')||'').trim(); const otp=String(f.get('otp')||'').trim(); const signature=f.get('signature');
  if(!(signature instanceof File)) return NextResponse.json({ok:false,error:'Assinatura não recebida.'},{status:400});
  const admin=createAdminSupabase();
  const {data:s}=await admin.from('signature_signers').select('*').eq('id',signerId).eq('signer_token',token).maybeSingle();
  if(!s) return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
  const {data:r}=await admin.from('signature_requests').select('*').eq('id',s.request_id).maybeSingle();
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  if(s.status==='assinado') return NextResponse.json({ok:false,error:'Este signatário já assinou.'},{status:409});
  const {data:pending}=await admin.from('signature_signers').select('id,signer_order,name,status').eq('request_id',r.id).eq('status','pendente').order('signer_order',{ascending:true}).limit(1).maybeSingle();
  if(!pending || pending.id!==s.id) return NextResponse.json({ok:false,error:`Aguardando a assinatura de ${pending?.name || 'outro signatário'}.`},{status:409});
  if(r.require_selfie && !s.selfie_path) return NextResponse.json({ok:false,error:'A selfie é obrigatória antes da assinatura.'},{status:400});
  if(r.require_document_photo && !s.document_photo_path) return NextResponse.json({ok:false,error:'A foto do documento é obrigatória.'},{status:400});
  if(r.require_otp){ if(!otp || !s.otp_hash || !s.otp_expires_at || new Date(s.otp_expires_at).getTime()<Date.now() || crypto.createHash('sha256').update(otp).digest('hex')!==s.otp_hash) return NextResponse.json({ok:false,error:'Código de autenticação inválido ou expirado.'},{status:400}); }
  const sourcePath=r.final_document_path||null;
  const {data:doc}=await admin.from('documents').select('*').eq('id',r.document_id).eq('law_firm_id',r.law_firm_id).maybeSingle(); if(!doc?.storage_path) return NextResponse.json({ok:false,error:'Documento original indisponível.'},{status:404});
  const {data:file,error}=sourcePath ? await admin.storage.from('documents').download(sourcePath) : await admin.storage.from('documents').download(doc.storage_path); if(error||!file) return NextResponse.json({ok:false,error:'Não foi possível abrir o documento.'},{status:400});
  const original=Buffer.from(await file.arrayBuffer()); const sigBuffer=Buffer.from(await signature.arrayBuffer()); const signaturePath=`${r.law_firm_id}/${r.id}/${s.id}-signature-${crypto.randomUUID()}.png`; const sigUpload=await admin.storage.from('signature-evidence').upload(signaturePath,sigBuffer,{contentType:'image/png',upsert:false}); if(sigUpload.error) return NextResponse.json({ok:false,error:'Não foi possível salvar a assinatura.'},{status:400});
  const pdf=await PDFDocument.load(original);
  const originalPage=pdf.getPage(0); const sig=await pdf.embedPng(sigBuffer); const x=s.signer_order===1?40:originalPage.getWidth()-220; originalPage.drawImage(sig,{x,y:45,width:180,height:90});
  const page=pdf.addPage(); const font=await pdf.embedFont(StandardFonts.Helvetica); page.drawText('CERTIFICADO DE ASSINATURA ELETRÔNICA — AdvOS',{x:40,y:page.getHeight()-60,size:16,font,color:rgb(0.05,0.37,0.33)}); page.drawText(`Documento: ${String(doc.title||'').slice(0,100)}`,{x:40,y:page.getHeight()-95,size:10,font}); page.drawText(`Signatário: ${String(s.name).slice(0,100)}`,{x:40,y:page.getHeight()-115,size:10,font}); page.drawText(`Ordem: ${s.signer_order===1?'Cliente':'Daniel Costa Ladeira'}`,{x:40,y:page.getHeight()-135,size:10,font}); page.drawText(`Data/hora: ${new Date().toLocaleString('pt-BR')}`,{x:40,y:page.getHeight()-155,size:10,font}); page.drawText(`Autenticação: ${r.require_otp?'OTP WhatsApp + ':''}${r.require_selfie?'selfie':''}${r.require_document_photo?' + documento':''}`,{x:40,y:page.getHeight()-175,size:10,font}); page.drawImage(sig,{x:40,y:page.getHeight()-345,width:260,height:130}); page.drawText('Este certificado registra evidências do processo de assinatura e não substitui assinatura qualificada ICP-Brasil quando esta for exigida.',{x:40,y:90,size:8,font,maxWidth:520});
  const final=Buffer.from(await pdf.save()); const hash=sha256(final); const finalPath=`${r.law_firm_id}/${r.id}/assinado-${s.signer_order}-${crypto.randomUUID()}.pdf`; const up=await admin.storage.from('documents').upload(finalPath,final,{contentType:'application/pdf',upsert:false}); if(up.error) return NextResponse.json({ok:false,error:'Não foi possível salvar o documento assinado.'},{status:400});
  await admin.from('signature_signers').update({status:'assinado',signature_image_path:signaturePath,signed_at:new Date().toISOString()}).eq('id',s.id);
  const {data:next}=await admin.from('signature_signers').select('id,name,signer_token,signer_order,status').eq('request_id',r.id).eq('status','pendente').order('signer_order',{ascending:true}).limit(1).maybeSingle();
  const newStatus=next?'aguardando_assinatura':'assinado';
  await admin.from('signature_requests').update({status:newStatus,signed_at:next?null:new Date().toISOString(),final_document_path:finalPath,final_document_hash:hash}).eq('id',r.id);
  await admin.from('documents').update({signature_status:newStatus==='assinado'?'assinado':'aguardando_assinatura'}).eq('id',doc.id).eq('law_firm_id',r.law_firm_id);
  await admin.from('document_signatures').insert({law_firm_id:r.law_firm_id,document_id:doc.id,provider:'advos',status:'assinado',external_id:s.signer_token,signature_url:null,signed_document_url:finalPath,signer_name:s.name,signer_email:s.email,signer_phone:s.phone,signed_at:new Date().toISOString(),selfie_path:s.selfie_path,document_photo_path:s.document_photo_path,audit_metadata:{hash,signer_order:s.signer_order,require_selfie:r.require_selfie,require_document_photo:r.require_document_photo}});
  await admin.from('signature_events').insert({law_firm_id:r.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'documento_assinado',metadata:{hash,signer_order:s.signer_order,next_signer_id:next?.id||null}});
  return NextResponse.json({ok:true,hash,status:newStatus});
}
