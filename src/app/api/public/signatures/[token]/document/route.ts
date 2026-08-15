import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function GET(_req: Request, { params }: { params: Promise<{ token:string }> }) {
  const { token } = await params; const admin=createAdminSupabase();
  const {data:byReq}=await admin.from('signature_requests').select('id,law_firm_id,document_id,status,expires_at,final_document_path').eq('public_token',token).maybeSingle();
  let r:any=byReq;
  if(!r){ const {data:s}=await admin.from('signature_signers').select('request_id').eq('signer_token',token).maybeSingle(); if(!s) return new NextResponse('Solicitação não encontrada.',{status:404}); const {data:req}=await admin.from('signature_requests').select('id,law_firm_id,document_id,status,expires_at,final_document_path').eq('id',s.request_id).maybeSingle(); r=req; }
  if(!r) return new NextResponse('Solicitação não encontrada.',{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now() && r.status!=='assinado') return new NextResponse('Link expirado.',{status:410});
  const path=r.final_document_path || (await admin.from('documents').select('storage_path').eq('id',r.document_id).eq('law_firm_id',r.law_firm_id).maybeSingle()).data?.storage_path;
  if(!path) return new NextResponse('Documento indisponível.',{status:404});
  const {data:doc}=await admin.from('documents').select('title').eq('id',r.document_id).maybeSingle();
  const {data:file,error}=await admin.storage.from('documents').download(path); if(error||!file) return new NextResponse('Documento indisponível.',{status:404});
  const buffer=Buffer.from(await file.arrayBuffer()); const safeName=String(doc?.title||'documento').replace(/[\r\n\"]+/g,' ').slice(0,120);
  return new NextResponse(buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${safeName}.pdf"`}});
}
