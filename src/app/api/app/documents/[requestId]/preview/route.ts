import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function GET(_req:Request,{params}:{params:Promise<{requestId:string}>}){
  const {profile}=await getCurrentProfile(); const {requestId}=await params; const db=createAdminSupabase();
  const {data:r}=await db.from('signature_requests').select('id,document_id').eq('id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle();
  if(!r) return new NextResponse('Solicitação não encontrada',{status:404});
  const {data:d}=await db.from('documents').select('storage_path,mime_type,title').eq('id',r.document_id).eq('law_firm_id',profile.law_firm_id).maybeSingle();
  if(!d?.storage_path) return new NextResponse('Documento não encontrado',{status:404});
  const {data:file,error}=await db.storage.from('documents').download(d.storage_path);
  if(error||!file) return new NextResponse('Documento indisponível',{status:404});
  return new NextResponse(file.stream(),{status:200,headers:{'Content-Type':d.mime_type||'application/pdf','Content-Disposition':`inline; filename="${String(d.title||'documento').replace(/"/g,'')}"`,'Cache-Control':'private, no-store'}});
}
