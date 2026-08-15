import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
const sha256=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
export async function POST(req:Request){
  const {session,profile}=await getCurrentAdminProfile(); const body=await req.json().catch(()=>({})); const requestId=String(body?.requestId||'').trim();
  if(!requestId)return NextResponse.json({ok:false,error:'Solicitação não informada.'},{status:400});
  const db=createAdminSupabase();
  const {data:r}=await db.from('signature_requests').select('*').eq('id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle(); if(!r)return NextResponse.json({ok:false,error:'Solicitação não encontrada.'},{status:404});
  const {data:s}=await db.from('signature_signers').select('*').eq('request_id',r.id).eq('law_firm_id',profile.law_firm_id).eq('signer_order',2).maybeSingle(); if(!s)return NextResponse.json({ok:false,error:'Signatário do escritório não encontrado.'},{status:404});
  if(s.status==='assinado')return NextResponse.json({ok:false,error:'A assinatura de Daniel já foi registrada.'},{status:409});
  if(!s.viewed_at)return NextResponse.json({ok:false,error:'Visualize o documento e confirme a leitura antes de assinar.'},{status:400});
  const {data:client}=await db.from('signature_signers').select('id,status').eq('request_id',r.id).eq('signer_order',1).maybeSingle(); if(client?.status!=='assinado')return NextResponse.json({ok:false,error:'A assinatura do cliente ainda está pendente.'},{status:409});
  const {data:doc}=await db.from('documents').select('*').eq('id',r.document_id).eq('law_firm_id',profile.law_firm_id).maybeSingle(); if(!doc)return NextResponse.json({ok:false,error:'Documento não encontrado.'},{status:404});
  const {data:file,error}=await db.storage.from('documents').download(r.final_document_path||doc.storage_path); if(error||!file)return NextResponse.json({ok:false,error:'Não foi possível abrir o documento.'},{status:400});
  const original=Buffer.from(await file.arrayBuffer()); const pdf=await PDFDocument.load(original); const font=await pdf.embedFont(StandardFonts.Helvetica); const page0=pdf.getPage(0); page0.drawText('Assinado eletronicamente por Daniel Costa Ladeira',{x:40,y:22,size:9,font,color:rgb(0.05,0.37,0.33)}); const page=pdf.addPage();
  page.drawText('CERTIFICADO DE ASSINATURA ELETRÔNICA — AdvOS',{x:40,y:page.getHeight()-60,size:16,font,color:rgb(0.05,0.37,0.33)}); page.drawText(`Documento: ${String(doc.title||'').slice(0,100)}`,{x:40,y:page.getHeight()-95,size:10,font}); page.drawText('Signatário: DANIEL COSTA LADEIRA',{x:40,y:page.getHeight()-115,size:10,font}); page.drawText('Perfil: Advogado responsável',{x:40,y:page.getHeight()-135,size:10,font}); page.drawText(`Data/hora: ${new Date().toLocaleString('pt-BR')}`,{x:40,y:page.getHeight()-155,size:10,font}); page.drawText(`Usuário autenticado no AdvOS: ${session.user.id}`,{x:40,y:page.getHeight()-175,size:9,font}); page.drawText('Não foi utilizada assinatura manuscrita. A manifestação de vontade foi registrada eletronicamente dentro do AdvOS.',{x:40,y:page.getHeight()-205,size:9,font,maxWidth:520}); page.drawText('Este certificado registra evidências do processo de assinatura e não substitui assinatura qualificada ICP-Brasil quando esta for exigida.',{x:40,y:90,size:8,font,maxWidth:520});
  const final=Buffer.from(await pdf.save()); const hash=sha256(final); const finalPath=`${r.law_firm_id}/${r.id}/assinado-final-${crypto.randomUUID()}.pdf`; const up=await db.storage.from('documents').upload(finalPath,final,{contentType:'application/pdf',upsert:false}); if(up.error)return NextResponse.json({ok:false,error:'Não foi possível salvar o documento final.'},{status:400});
  await db.from('signature_signers').update({status:'assinado',signed_at:new Date().toISOString()}).eq('id',s.id);
  await db.from('signature_requests').update({status:'assinado',signed_at:new Date().toISOString(),final_document_path:finalPath,final_document_hash:hash}).eq('id',r.id);
  await db.from('documents').update({signature_status:'assinado'}).eq('id',doc.id).eq('law_firm_id',profile.law_firm_id);
  await db.from('document_signatures').insert({law_firm_id:profile.law_firm_id,document_id:doc.id,provider:'advos',status:'assinado',external_id:s.id,signature_url:null,signed_document_url:finalPath,signer_name:s.name,signer_email:s.email,signer_phone:s.phone,signed_at:new Date().toISOString(),audit_metadata:{hash,signer_order:2,auth:'advos_authenticated_user'}});
  await db.from('signature_events').insert({law_firm_id:profile.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'documento_assinado',metadata:{hash,signer_order:2,user_id:session.user.id}});
  return NextResponse.json({ok:true,hash,status:'assinado'});
}
