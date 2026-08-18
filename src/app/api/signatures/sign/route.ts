import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

async function resolveSignerWithPublicToken(db:any, signerId:string, token:string){
  const {data:signer}=await db.from('signature_signers').select('*').eq('id',signerId).maybeSingle();
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


const sha256=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const safe=(v:unknown)=>String(v??'').trim();
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const makeSignatureImage=async(name:string)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220" viewBox="0 0 900 220"><rect width="100%" height="100%" fill="white"/><path d="M25 165 H875" stroke="#cbd5e1" stroke-width="2"/><text x="25" y="120" font-family="Georgia, Times New Roman, serif" font-size="42" font-style="italic" fill="#111827">${esc(name)}</text><text x="25" y="195" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#64748b">Assinatura eletrônica</text></svg>`);

async function readImageFromStorage(db:any,bucket:string,imagePath:string){
  if(!imagePath) return null;
  const {data,error}=await db.storage.from(bucket).download(imagePath);
  if(error||!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function getDanielPhoto(db:any, lawFirmId:string){
  try{
    const {data:profiles}=await db.from('profiles').select('auth_user_id,full_name').eq('law_firm_id',lawFirmId).ilike('full_name','Daniel Costa Ladeira').limit(1);
    const p=profiles?.[0];
    if(p?.auth_user_id){
      const {data:user}=await db.auth.admin.getUserById(p.auth_user_id);
      const url=user?.user?.user_metadata?.avatar_url||user?.user?.user_metadata?.picture;
      if(url){ const r=await fetch(String(url)); if(r.ok) return Buffer.from(await r.arrayBuffer()); }
    }
  }catch{}
  try{return fs.readFileSync(path.join(process.cwd(),'public','brand','ladeira-advogados.png'));}catch{return null;}
}

async function buildSignedPdf({original,doc,request,signers,events,clientSelfie,danielPhoto,finalizing}:{original:Buffer,doc:any,request:any,signers:any[],events:any[],clientSelfie:Buffer|null,danielPhoto:Buffer|null,finalizing:boolean}){
  const pdf=await PDFDocument.load(original);
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic=await pdf.embedFont(StandardFonts.HelveticaOblique);
  let logo:any=null; try{logo=await pdf.embedPng(fs.readFileSync(path.join(process.cwd(),'public','brand','ladeira-advogados.png')))}catch{}
  const teal=rgb(0.05,0.36,0.31), ink=rgb(0.08,0.09,0.11), muted=rgb(0.38,0.42,0.47), line=rgb(0.87,0.88,0.9), pale=rgb(0.97,0.98,0.98), green=rgb(0.08,0.48,0.27);
  // A dedicated signature/evidence section is appended so the original contract layout remains intact.
  const p=pdf.addPage([595.28,841.89]);
  p.drawLine({start:{x:45,y:760},end:{x:550,y:760},thickness:0.8,color:line});
  if(logo) p.drawImage(logo,{x:468,y:776,width:66,height:50});
  p.drawText('LADEIRA ADVOGADOS',{x:45,y:785,size:10,font:bold,color:ink});
  p.drawText('REGISTRO DE ASSINATURAS ELETRÔNICAS',{x:45,y:720,size:16,font:bold,color:teal});
  p.drawText(String(doc.title||'Documento'),{x:45,y:696,size:11,font:regular,color:ink});
  p.drawText(`Status: ${finalizing?'Assinado':'Aguardando assinatura'}`,{x:45,y:678,size:10,font:bold,color:finalizing?green:muted});
  p.drawText(`Hash do documento original (SHA-256): ${sha256(original)}`,{x:45,y:658,size:8,font:regular,color:muted});

  const sorted=[...signers].sort((a,b)=>Number(a.signer_order)-Number(b.signer_order));
  let y=620;
  for(const s of sorted){
    const signed=String(s.status||'')==='assinado';
    const boxH=172;
    p.drawRectangle({x:45,y:y-boxH,width:505,height:154,borderWidth:1,borderColor:line,color:pale});
    const image=s.signer_order===1?clientSelfie:danielPhoto;
    if(image){
      try{
        let img:any; try{img=await pdf.embedJpg(image)}catch{img=await pdf.embedPng(image)}
        const size=88; p.drawImage(img,{x:60,y:y-118,width:size,height:size});
      }catch{}
    }else{
      p.drawCircle({x:104,y:y-74,size:44,borderWidth:1,borderColor:line,color:rgb(0.92,0.93,0.94)});
      p.drawText(s.signer_order===1?'C':'DL',{x:85,y:y-80,size:11,font:bold,color:muted});
    }
    p.drawText(s.signer_order===1?'CLIENTE':'DANIEL COSTA LADEIRA',{x:165,y:y-24,size:9,font:bold,color:teal});
    p.drawText(String(s.name||''),{x:165,y:y-44,size:13,font:bold,color:ink});
    if(s.email) p.drawText(`E-mail: ${String(s.email)}`,{x:165,y:y-64,size:8.5,font:regular,color:muted});
    if(s.phone) p.drawText(`Telefone: ${String(s.phone)}`,{x:165,y:y-80,size:8.5,font:regular,color:muted});
    if(s.cpf) p.drawText(`CPF: ${String(s.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')}`,{x:165,y:y-94,size:8.5,font:regular,color:muted});
    p.drawText(`Método: ${s.signer_order===1?'OTP WhatsApp + selfie + confirmação de nome':'Conta autenticada do AdvOS'}`,{x:165,y:y-96,size:8.5,font:regular,color:muted});
    p.drawText(`Status: ${signed?'Assinado':'Pendente'}`,{x:165,y:y-128,size:8.5,font:bold,color:signed?green:muted});
    if(signed){
      const ev=events.find((e:any)=>e.signer_id===s.id && e.event_type==='documento_assinado');
      const when=s.signed_at?new Date(s.signed_at).toLocaleString('pt-BR'):'—';
      p.drawText(`Data/hora: ${when}`,{x:165,y:y-144,size:8,font:regular,color:muted});
      const ip=signed&&ev?.metadata?.ip?String(ev.metadata.ip):'';
      if(ip)p.drawText(`IP: ${ip}`,{x:165,y:y-158,size:8,font:regular,color:muted});
      const ua=signed&&ev?.metadata?.user_agent?String(ev.metadata.user_agent):'';
      if(ua)p.drawText(`Dispositivo: ${ua.slice(0,72)}`,{x:165,y:y-172,size:7.2,font:regular,color:muted});
      p.drawText(String(s.name||'').trim(),{x:165,y:y-116,size:15,font:italic,color:ink});
      p.drawLine({start:{x:165,y:y-119},end:{x:420,y:y-119},thickness:0.8,color:rgb(0.65,0.68,0.72)});
      p.drawText('Assinatura eletrônica registrada',{x:430,y:y-118,size:7.5,font:bold,color:teal});
    }
    y-=182;
  }
  const cert=pdf.addPage([595.28,841.89]);
  if(logo) cert.drawImage(logo,{x:468,y:776,width:66,height:50});
  cert.drawText('CERTIFICADO DE ASSINATURA ELETRÔNICA',{x:45,y:785,size:12,font:bold,color:ink});
  cert.drawText('EVIDÊNCIAS DO PROCESSO',{x:45,y:750,size:16,font:bold,color:teal});
  const finalHashPlaceholder='Será calculado no arquivo final';
  let cy=720;
  const meta=[
    ['Documento',String(doc.title||'')],
    ['ID da solicitação',String(request.id||'')],
    ['Status',finalizing?'Assinado':'Aguardando assinatura'],
    ['Hash original SHA-256',sha256(original)],
    ['Assinaturas',`${sorted.filter((s:any)=>s.status==='assinado').length} de ${sorted.length}`],
    ['Última atualização',new Date().toLocaleString('pt-BR')],
  ];
  for(const [k,v] of meta){cert.drawText(k,{x:45,y:cy,size:9,font:bold,color:muted});cert.drawText(v.slice(0,110),{x:185,y:cy,size:9,font:regular,color:ink});cy-=20;}
  cy-=8;
  cert.drawText('AUTENTICAÇÃO DOS SIGNATÁRIOS',{x:45,y:cy,size:11,font:bold,color:teal});cy-=24;
  for(const s of sorted){
    cert.drawText(String(s.name||''),{x:45,y:cy,size:10,font:bold,color:ink});cy-=16;
    cert.drawText(`Papel: ${s.signer_order===1?'Cliente':'Daniel Costa Ladeira'}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;
    cert.drawText(`Método: ${s.signer_order===1?'OTP WhatsApp + selfie + confirmação de nome':'Conta autenticada do AdvOS + confirmação interna'}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;
    if(s.email) {cert.drawText(`E-mail: ${s.email}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;}
    if(s.phone) {cert.drawText(`Telefone: ${s.phone}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;}
    if(s.cpf){cert.drawText(`CPF: ${String(s.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4')}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;}
    const ev=events.find((e:any)=>e.signer_id===s.id && e.event_type==='documento_assinado');
    if(ev?.metadata?.ip){cert.drawText(`IP: ${String(ev.metadata.ip)}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;}
    if(ev?.metadata?.user_agent){cert.drawText(`Dispositivo: ${String(ev.metadata.user_agent).slice(0,90)}`,{x:60,y:cy,size:8.5,font:regular,color:muted});cy-=14;}
    if(s.signer_order===1 && s.selfie_path){cert.drawText('Selfie: anexada ao relatório',{x:60,y:cy,size:8.5,font:bold,color:teal});cy-=14;}
    cy-=10;
  }
  cert.drawText('Este relatório é parte integrante do documento e registra as evidências capturadas pelo AdvOS.',{x:45,y:72,size:8,font:regular,color:muted});
  cert.drawText('A assinatura é eletrônica. Nenhuma assinatura manual foi exigida.',{x:45,y:57,size:8,font:bold,color:ink});
  return Buffer.from(await pdf.save());
}

export async function POST(req:Request){
  const f=await req.formData(); const token=safe(f.get('token')); const signerId=safe(f.get('signerId')); const requestId=safe(f.get('requestId')); const otp=safe(f.get('otp')); const confirmationName=safe(f.get('confirmation_name')); const cpf=safe(f.get('cpf')).replace(/\D/g,'');
  const admin=createAdminSupabase(); let s:any=null; let r:any=null; let internal=false;
  if(!token){
    const {profile}=await getCurrentProfile(); internal=true;
    const {data:sr}=await admin.from('signature_signers').select('*').eq('id',signerId).eq('request_id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle(); s=sr;
    if(!s || s.role!=='advogado') return NextResponse.json({ok:false,error:'Assinatura do escritório não autorizada.'},{status:403});
    const {data:rr}=await admin.from('signature_requests').select('*').eq('id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle(); r=rr;
  }else{
    const resolved=await resolveSignerWithPublicToken(admin, signerId, token); s=resolved?.signer||null; if(!s)return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
    const {data:rr}=await admin.from('signature_requests').select('*').eq('id',s.request_id).maybeSingle(); r=rr;
  }
  if(!r)return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at&&new Date(r.expires_at).getTime()<Date.now())return NextResponse.json({ok:false,error:'Solicitação expirada.'},{status:410});
  if(s.status==='assinado')return NextResponse.json({ok:false,error:'Este signatário já assinou.'},{status:409});
  const {data:pending}=await admin.from('signature_signers').select('id,name,signer_order,status').eq('request_id',r.id).eq('status','pendente').order('signer_order',{ascending:true}).limit(1).maybeSingle();
  if(!pending||pending.id!==s.id)return NextResponse.json({ok:false,error:`Aguardando a assinatura de ${pending?.name||'outro signatário'}.`},{status:409});
  const {data:viewEvent}=await admin.from('signature_events').select('id').eq('request_id',r.id).eq('signer_id',s.id).eq('event_type','documento_visualizado').limit(1).maybeSingle(); if(!viewEvent)return NextResponse.json({ok:false,error:'É necessário visualizar o documento antes de assinar.'},{status:400});
  if(!internal){
    if(s.role==='cliente'&&r.require_selfie&&!s.selfie_path){
      const {data:selfieEvent}=await admin.from('signature_events').select('metadata').eq('request_id',r.id).eq('signer_id',s.id).eq('event_type','evidencia_facial_recebida').order('created_at',{ascending:false}).limit(1).maybeSingle();
      const recoveredPath=String((selfieEvent as any)?.metadata?.selfie_path||'').trim();
      if(recoveredPath){
        s.selfie_path=recoveredPath;
        const rec=await admin.from('signature_signers').update({selfie_path:recoveredPath}).eq('id',s.id);
        if(rec.error) return NextResponse.json({ok:false,error:'A selfie foi capturada, mas não foi possível vinculá-la à assinatura.'},{status:400});
      } else {
        return NextResponse.json({ok:false,error:'A selfie foi capturada, mas não foi registrada. Capture a selfie novamente.'},{status:400});
      }
    }
    if(s.role==='cliente'&&r.require_otp){if(!otp||!s.otp_hash||!s.otp_expires_at||new Date(s.otp_expires_at).getTime()<Date.now()||crypto.createHash('sha256').update(otp).digest('hex')!==s.otp_hash)return NextResponse.json({ok:false,error:'Código de autenticação inválido ou expirado.'},{status:400});}
    if(s.role==='cliente'&&cpf.length!==11)return NextResponse.json({ok:false,error:'CPF inválido.'},{status:400});
    if(s.role==='cliente'&&s.cpf&&String(s.cpf).replace(/\D/g,'')!==cpf)return NextResponse.json({ok:false,error:'CPF informado não confere com o cadastro.'},{status:400});
    if(s.role==='cliente'&&confirmationName.trim().toLowerCase()!==String(s.name||'').trim().toLowerCase())return NextResponse.json({ok:false,error:'Confirmação de nome inválida.'},{status:400});
  }else if(confirmationName.trim().toLowerCase()!==String(s.name||'DANIEL COSTA LADEIRA').trim().toLowerCase()){
    return NextResponse.json({ok:false,error:'Confirmação do nome do escritório inválida.'},{status:400});
  }
  const {data:doc}=await admin.from('documents').select('*').eq('id',r.document_id).eq('law_firm_id',r.law_firm_id).maybeSingle(); if(!doc?.storage_path)return NextResponse.json({ok:false,error:'Documento original indisponível.'},{status:404});
  const {data:originalFile,error:downloadError}=await admin.storage.from('documents').download(doc.storage_path); if(downloadError||!originalFile)return NextResponse.json({ok:false,error:'Não foi possível abrir o documento original.'},{status:400});
  const original=Buffer.from(await originalFile.arrayBuffer());
  const signatureBuffer=await makeSignatureImage(internal?'Daniel Costa Ladeira':String(s.name||'Cliente')); const signaturePath=`${r.law_firm_id}/${r.id}/${s.id}-signature-${crypto.randomUUID()}.svg`; const sigUpload=await admin.storage.from('signature-evidence').upload(signaturePath,signatureBuffer,{contentType:'image/svg+xml',upsert:false}); if(sigUpload.error)return NextResponse.json({ok:false,error:'Não foi possível salvar a evidência da assinatura.'},{status:400});
  const now=new Date(); const headers=req.headers; const ip=safe(headers.get('x-forwarded-for')||headers.get('x-real-ip')||'').split(',')[0].trim(); const userAgent=safe(headers.get('user-agent')||'');
  await admin.from('signature_signers').update({status:'assinado',signature_image_path:signaturePath,signed_at:now.toISOString(),cpf:(!internal&&cpf)?cpf:s.cpf||null}).eq('id',s.id);
  await admin.from('signature_events').insert({law_firm_id:r.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'documento_assinado',metadata:{signer_order:s.signer_order,internal,ip,user_agent:userAgent,cpf:(!internal&&cpf)?cpf:s.cpf||null}});
  const {data:signers}=await admin.from('signature_signers').select('*').eq('request_id',r.id).order('signer_order',{ascending:true});
  const {data:events}=await admin.from('signature_events').select('signer_id,event_type,metadata,created_at').eq('request_id',r.id).in('event_type',['documento_assinado']);
  const clientSelfie=s.selfie_path&&s.signer_order===1?await readImageFromStorage(admin,'signature-evidence',s.selfie_path):((signers||[]).find((x:any)=>x.signer_order===1)?.selfie_path?await readImageFromStorage(admin,'signature-evidence',(signers||[]).find((x:any)=>x.signer_order===1).selfie_path):null);
  const danielPhoto=await getDanielPhoto(admin,r.law_firm_id);
  const allSigned=(signers||[]).length===2&&(signers||[]).every((x:any)=>x.status==='assinado');
  const final=await buildSignedPdf({original,doc,request:r,signers:signers||[],events:events||[],clientSelfie,danielPhoto,finalizing:allSigned});
  const hash=sha256(final); const finalPath=`${r.law_firm_id}/${r.id}/documento-assinado-${crypto.randomUUID()}.pdf`; const up=await admin.storage.from('documents').upload(finalPath,final,{contentType:'application/pdf',upsert:false}); if(up.error)return NextResponse.json({ok:false,error:'Não foi possível salvar o documento assinado.'},{status:400});
  if(allSigned){
    const clientId=doc.client_id||null;
    const signedTitle=`Contrato assinado - ${String(doc.title||'Documento').replace(/\.pdf$/i,'')}.pdf`;
    let existingSigned:any=null;
    let signedQuery=admin.from('documents').select('id').eq('law_firm_id',r.law_firm_id).eq('title',signedTitle).limit(1);
    if(clientId) signedQuery=signedQuery.eq('client_id',clientId); else signedQuery=signedQuery.is('client_id',null);
    const existing=await signedQuery.maybeSingle(); existingSigned=existing.data;
    if(!existingSigned){ await admin.from('documents').insert({law_firm_id:r.law_firm_id,client_id:clientId,title:signedTitle,doc_type:'contrato_assinado',storage_path:finalPath,notes:'Documento final assinado eletronicamente no AdvOS.',signature_status:'assinado'}); }
  }
  const next=(signers||[]).find((x:any)=>x.status==='pendente'); const newStatus=next?'aguardando_assinatura':'assinado';
  await admin.from('signature_requests').update({status:newStatus,signed_at:next?null:now.toISOString(),final_document_path:finalPath,final_document_hash:hash}).eq('id',r.id);
  await admin.from('documents').update({signature_status:newStatus==='assinado'?'assinado':'aguardando_assinatura'}).eq('id',doc.id).eq('law_firm_id',r.law_firm_id);
  await admin.from('document_signatures').insert({law_firm_id:r.law_firm_id,document_id:doc.id,provider:'advos',status:'assinado',external_id:s.id,signature_url:null,signed_document_url:finalPath,signer_name:s.name,signer_email:s.email,signer_phone:s.phone,signed_at:now.toISOString(),selfie_path:internal?null:s.selfie_path,document_photo_path:internal?null:s.document_photo_path,audit_metadata:{hash,signer_order:s.signer_order,internal,ip,user_agent:userAgent,final_document_path:finalPath}});
  return NextResponse.json({ok:true,hash,status:newStatus});
}
