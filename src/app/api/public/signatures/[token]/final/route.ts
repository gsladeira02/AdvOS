import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params; const db=createAdminSupabase();
  const {data:byReq}=await db.from('signature_requests').select('law_firm_id,status,final_document_path,document_id').eq('public_token',token).maybeSingle();
  let r:any=byReq; if(!r){ const {data:s}=await db.from('signature_signers').select('request_id').eq('signer_token',token).maybeSingle(); if(s){ r=(await db.from('signature_requests').select('law_firm_id,status,final_document_path,document_id').eq('id',s.request_id).maybeSingle()).data; } }
  if(!r||r.status!=='assinado'||!r.final_document_path)return new NextResponse('Documento ainda não foi assinado por todos os signatários.',{status:409});
  const {data:file,error}=await db.storage.from('documents').download(r.final_document_path); if(error||!file)return new NextResponse('Arquivo indisponível.',{status:404}); return new NextResponse(Buffer.from(await file.arrayBuffer()),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="documento-assinado.pdf"'}});
}
