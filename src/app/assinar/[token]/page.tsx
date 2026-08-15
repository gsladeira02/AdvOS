import SignClient from './sign-client';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export default async function PublicSignPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params; const admin=createAdminSupabase();
  const {data:r}=await admin.from('signature_requests').select('id,status,expires_at,require_selfie,require_document_photo,require_otp,document_id').eq('public_token',token).maybeSingle();
  if(!r) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-black">Link inválido</h1><p className="mt-2 text-sm text-slate-600">A solicitação de assinatura não foi encontrada.</p></div></main>;
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now() && r.status!=='assinado') return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-black">Link expirado</h1><p className="mt-2 text-sm text-slate-600">Solicite um novo link ao escritório.</p></div></main>;
  const {data:doc}=await admin.from('documents').select('title').eq('id',r.document_id).maybeSingle();
  const {data:signer}=await admin.from('signature_signers').select('name,phone,email,status').eq('request_id',r.id).order('created_at').limit(1).maybeSingle();
  return <SignClient token={token} title={doc?.title||'Documento'} signer={signer} settings={{requireSelfie:r.require_selfie,requireDocumentPhoto:r.require_document_photo,requireOtp:r.require_otp}} status={r.status}/>;
}
