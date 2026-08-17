import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import InternalSignClient from './sign-client';
export const dynamic='force-dynamic';
export default async function InternalSignPage({params}:{params:Promise<{requestId:string}>}){
  const {profile}=await getCurrentProfile(); const {requestId}=await params; const db=createAdminSupabase();
  const {data:r}=await db.from('signature_requests').select('id,document_id,status,expires_at').eq('id',requestId).eq('law_firm_id',profile.law_firm_id).maybeSingle();
  if(!r)return <main className="min-h-screen p-6"><div className="mx-auto max-w-xl card p-6"><h1 className="text-xl font-black">Assinatura não encontrada</h1></div></main>;
  const {data:signer}=await db.from('signature_signers').select('id,name,email,phone,status,role,signer_order').eq('request_id',r.id).eq('law_firm_id',profile.law_firm_id).eq('role','advogado').maybeSingle();
  const {data:doc}=await db.from('documents').select('title').eq('id',r.document_id).eq('law_firm_id',profile.law_firm_id).maybeSingle();
  if(!signer)return <main className="min-h-screen p-6"><div className="mx-auto max-w-xl card p-6"><h1 className="text-xl font-black">Signatário do escritório não encontrado</h1></div></main>;
  return <InternalSignClient requestId={r.id} signerId={signer.id} title={doc?.title||'Documento'} status={r.status} signer={signer}/>;
}
