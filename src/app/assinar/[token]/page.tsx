import SignClient from './sign-client';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
export default async function PublicSignPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params; const admin=createAdminSupabase();
  const {data:byRequest}=await admin.from('signature_requests').select('id,status,expires_at,require_selfie,require_document_photo,require_otp,document_id').eq('public_token',token).maybeSingle();
  let r:any=byRequest; let signer:any=null;
  if(!r){
    const {data:s}=await admin.from('signature_signers').select('id,request_id,name,phone,email,status,signer_token,signer_order').eq('signer_token',token).maybeSingle();
    if(!s) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-black">Link inválido</h1><p className="mt-2 text-sm text-slate-600">A solicitação de assinatura não foi encontrada.</p></div></main>;
    signer=s;
    const {data:req}=await admin.from('signature_requests').select('id,status,expires_at,require_selfie,require_document_photo,require_otp,document_id').eq('id',s.request_id).maybeSingle();
    r=req;
  }
  if(!r) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-black">Link inválido</h1></div></main>;
  if(!signer){ const {data:s}=await admin.from('signature_signers').select('id,name,phone,email,status,role,signer_token,signer_order').eq('request_id',r.id).order('signer_order',{ascending:true}).limit(1).maybeSingle(); signer=s; }
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now() && r.status!=='assinado') return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-black">Link expirado</h1><p className="mt-2 text-sm text-slate-600">Solicite um novo link ao escritório.</p></div></main>;
  const {data:doc}=await admin.from('documents').select('title').eq('id',r.document_id).maybeSingle();
  return <SignClient token={token} requestId={r.id} signerId={signer?.id||''} title={doc?.title||'Documento'} signer={signer} settings={{requireSelfie:r.require_selfie,requireDocumentPhoto:r.require_document_photo,requireOtp:r.require_otp}} status={r.status}/>;
}
