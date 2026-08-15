import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
export async function POST(req:Request){
  const f=await req.formData(); const token=String(f.get('token')||'').trim(); const signerId=String(f.get('signerId')||'').trim(); const selfie=f.get('selfie'); const docPhoto=f.get('document_photo');
  if(!(selfie instanceof File)) return NextResponse.json({ok:false,error:'Selfie não enviada.'},{status:400});
  const admin=createAdminSupabase();
  const {data:s}=await admin.from('signature_signers').select('id,request_id,law_firm_id').eq('id',signerId).eq('signer_token',token).maybeSingle();
  if(!s) return NextResponse.json({ok:false,error:'Signatário inválido.'},{status:404});
  const {data:r}=await admin.from('signature_requests').select('id,law_firm_id,require_selfie,require_document_photo,expires_at').eq('id',s.request_id).eq('law_firm_id',s.law_firm_id).maybeSingle();
  if(!r) return NextResponse.json({ok:false,error:'Solicitação inválida.'},{status:404});
  if(r.expires_at && new Date(r.expires_at).getTime()<Date.now()) return NextResponse.json({ok:false,error:'Link expirado.'},{status:410});
  const bucket='signature-evidence'; const ext='jpg'; const selfiePath=`${r.law_firm_id}/${r.id}/${signerId}-selfie-${crypto.randomUUID()}.${ext}`;
  const sb=admin.storage.from(bucket); const selfBuf=Buffer.from(await selfie.arrayBuffer());
  if(selfBuf.length>10*1024*1024) return NextResponse.json({ok:false,error:'Selfie muito grande.'},{status:400});
  const up=await sb.upload(selfiePath,selfBuf,{contentType:selfie.type||'image/jpeg',upsert:false}); if(up.error) return NextResponse.json({ok:false,error:up.error.message},{status:400});
  let docPath:string|null=null;
  if(docPhoto instanceof File){const buf=Buffer.from(await docPhoto.arrayBuffer()); if(buf.length>10*1024*1024) return NextResponse.json({ok:false,error:'Documento muito grande.'},{status:400}); docPath=`${r.law_firm_id}/${r.id}/${signerId}-document-${crypto.randomUUID()}.${ext}`; const d=await sb.upload(docPath,buf,{contentType:docPhoto.type||'image/jpeg',upsert:false}); if(d.error) return NextResponse.json({ok:false,error:d.error.message},{status:400});}
  await admin.from('signature_signers').update({selfie_path:selfiePath,document_photo_path:docPath}).eq('id',s.id);
  await admin.from('signature_events').insert({law_firm_id:r.law_firm_id,request_id:r.id,signer_id:s.id,event_type:'evidencia_facial_recebida',metadata:{has_document:Boolean(docPath),mime:selfie.type}});
  return NextResponse.json({ok:true});
}
