import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createAdminSupabase } from '@/lib/supabase/admin';
const sha256=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');

async function buildSignedPdf(original: Buffer, docTitle: string, signerName: string, roleLabel: string, authLabel: string) {
  const pdf=await PDFDocument.load(original);
  const first=pdf.getPage(0); const font=await pdf.embedFont(StandardFonts.Helvetica);
  first.drawText(`Assinado eletronicamente por ${signerName}`,{x:40,y:35,size:9,font,color:rgb(0.05,0.37,0.33)});
  const page=pdf.addPage();
  page.drawText('CERTIFICADO DE ASSINATURA ELETRÔNICA — AdvOS',{x:40,y:page.getHeight()-60,size:16,font,color:rgb(0.05,0.37,0.33)});
  page.drawText(`Documento: ${String(docTitle||'').slice(0,100)}`,{x:40,y:page.getHeight()-95,size:10,font});
  page.drawText(`Signatário: ${String(signerName).slice(0,100)}`,{x:40,y:page.getHeight()-115,size:10,font});
  page.drawText(`Perfil: ${roleLabel}`,{x:40,y:page.getHeight()-135,size:10,font});
  page.drawText(`Data/hora: ${new Date().toLocaleString('pt-BR')}`,{x:40,y:page.getHeight()-155,size:10,font});
  page.drawText(`Autenticação: ${authLabel}`,{x:40,y:page.getHeight()-175,size:10,font});
  page.drawText('Não foi utilizada assinatura manuscrita. A manifestação de vontade foi registrada eletronicamente com as evidências do processo.',{x:40,y:page.getHeight()-205,size:9,font,maxWidth:520});
  page.drawText('Este certificado registra evidências do processo de assinatura e não substitui assinatura qualificada ICP-Brasil quando esta for exigida.',{x:40,y:90,size:8,font,maxWidth:520});
  return Buffer.from(await pdf.save());
}

export async function POST(req:Request){
  const f=await req.formData(); const token=String(f.get('token')||'').trim(); const signerId=String(f.get('signerId')||'').trim(); const otp=String(f.get('otp')||'').trim();
  if(!token || !signerId) return NextResponse.json({ok:false,error:'Identificação da assinatura ausente.'},{status:400});
  const admin=createAdminSupabase();
  const {data:s}=await admin.from('signature_signers').select('*').eq('id',signerId).eq('signer_token',token).maybeSingle();
  if(!s || Number(s.signer_order)!==1) return NextResponse.json({ok:false,error:'Signatário público inválido.'},{status:404});
  const {data:r}=await admin.from('signature_requests').select('*').eq('id',s.request_id).maybeSingle();
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(!s.viewed_at) return NextResponse.json({ok:false,error:'Você precisa visualizar o documento e confirmar a leitura antes de assinar.'},{status:400});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  if(s.status==='assinado') return NextResponse.json({ok:false,error:'Este signatário já assinou.'},{status:409});
  const {data:pending}=await admin.from('signature_signers').select('id,signer_order,name,status').eq('request_id',r.id).eq('status','pendente').order('signer_order',{ascending:true}).limit(1).maybeSingle();
  if(!pending || pending.id!==s.id) return NextResponse.json({ok:false,error:`Aguardando a assinatura de ${pending?.name || 'outro signatário'}.`},{status:409});
  if(r.require_selfie && !s.selfie_path) return NextResponse.json({ok:false,error:'A selfie é obrigatória antes da assinatura.'},{status:400});
  if(r.require_document_photo && !s.document_photo_path) return NextResponse.json({ok:false,error:'A foto do documento é obrigatória.'},{status:400});
  if(r.require_otp){ if(!otp || !s.otp_hash || !s.otp_expires_at || new Date(s.otp_expires_at).getTime()<Date.now() || crypto.createHash('sha256').update(otp).digest('hex')!==s.otp_hash) return NextResponse.json({ok:false,error:'Código de autenticação inválido ou expirado.'},{status:400}); }
  const {data:doc}=await admin.from('documents').select('*').eq('id',r.document_id).eq('law_firm_id',r.law_firm_id).maybeSingle();
  if(!doc?.storage_path && !r.final_document_path) return NextResponse.json({ok:false,error:'Documento original indisponível.'},{status:404});
  const {data:file,error}=await admin.storage.from('documents').download(r.final_document_path||doc.storage_path); if(error||!file) return NextResponse.json({ok:false,error:'Não foi possível abrir o documento.'},{status:400});
  const original=Buffer.from(await file.arrayBuffer());
  const final=await buildSignedPdf(original,doc.title||'Documento',s.name,'Cliente',`${r.require_otp?'OTP WhatsApp + ':''}${r.require_selfie?'selfie':''}`);
  const hash=sha256(final); const finalPath=`${r.law_firm_id}/${r.id}/assinado-cliente-${crypto.randomUUID()}.pdf`;
  const up=await admin.storage.from('documents').upload(finalPath,final,{contentType:'application/pdf',upsert:false}); if(up.error) return NextResponse.json({ok:false,error:'Não foi possível salvar o documento assinado.'},{status:400});
  await admin.from('signature_signers').update({status:'assinado',signed_at:new Date().toISOString()}).eq('id',s.id);
  const {data:next}=await admin.from('signature_signers').select('id,name,signer_order,status').eq('request_id',r.id).eq('status','pendente').order('signer_order',{ascending:true}).limit(1).maybeSingle();
  const newStatus=next?'aguardando_assinatura':'assinado';
  await admin.from('signature_requests').update({status:newStatus,signed_at:next?null:new Date().toISOString(),final_document_path:finalPath,final_document_hash:hash}).eq('id',r.id);
  await admin.from('documents').update({signature_status:newStatus==='assinado'?'assinado':'aguardando_assinatura'}).eq('id',doc.id).eq('law_firm_id',r.law_firm_id);
  await admin.from('document_signatures').insert({law_firm_id:r.law_firm_id,document_id:doc.id,provider:'advos',status:'assinado',external_id:s.id,signature_url:null,signed_document_url:finalPath,signer_name:s.name,signer_email:s.email,signer_phone:s.phone,signed_at:new Date().toISOString(),selfie_path:s.selfie_path,document_photo_path:s.document_photo_path,audit_metadata:{hash,signer_order:1,auth:r.require_otp?'otp_whatsapp+selfie':'selfie'}});
  await admin.from('signature_events').insert({law_firm_id:r.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'documento_assinado',metadata:{hash,signer_order:1,next_signer_id:next?.id||null}});
  return NextResponse.json({ok:true,hash,status:newStatus});
}
