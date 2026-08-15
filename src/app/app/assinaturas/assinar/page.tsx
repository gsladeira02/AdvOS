import { createAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentAdminProfile } from '@/lib/current';
import OfficeSignClient from './office-sign-client';
export const dynamic='force-dynamic';
export default async function OfficeSignPage({searchParams}:{searchParams:Promise<{requestId?:string}>}){
  const {profile}=await getCurrentAdminProfile(); const {requestId}=await searchParams; const id=String(requestId||'').trim(); const db=createAdminSupabase();
  if(!id)return <main className="p-6"><div className="card p-6">Solicitação não informada.</div></main>;
  const {data:r}=await db.from('signature_requests').select('id,document_id,status,expires_at').eq('id',id).eq('law_firm_id',profile.law_firm_id).maybeSingle(); if(!r)return <main className="p-6"><div className="card p-6">Solicitação não encontrada.</div></main>;
  const {data:doc}=await db.from('documents').select('title').eq('id',r.document_id).eq('law_firm_id',profile.law_firm_id).maybeSingle();
  return <OfficeSignClient requestId={r.id} documentId={r.document_id} title={doc?.title||'Documento'} />;
}
