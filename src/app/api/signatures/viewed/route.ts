import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || '').trim();
  const signerId = String(body?.signerId || '').trim();
  if (!token || !signerId) return NextResponse.json({ ok:false, error:'Identificação da assinatura ausente.' }, { status:400 });
  const db = createAdminSupabase();
  const { data: signer } = await db.from('signature_signers')
    .select('id,request_id,signer_order,status,signer_token')
    .eq('id', signerId).eq('signer_token', token).maybeSingle();
  if (!signer || Number(signer.signer_order) !== 1) return NextResponse.json({ ok:false, error:'Link público inválido.' }, { status:403 });
  const now = new Date().toISOString();
  await db.from('signature_signers').update({ viewed_at: now }).eq('id', signer.id);
  const requestId = signer.request_id;
  const { data: reqRow } = await db.from('signature_requests').select('law_firm_id').eq('id', requestId).maybeSingle();
  if (reqRow?.law_firm_id) {
    await db.from('signature_events').insert({ law_firm_id:reqRow.law_firm_id, request_id:requestId, signer_id:signer.id, event_type:'documento_visualizado', metadata:{public:true} });
  }
  return NextResponse.json({ ok:true, viewedAt: now });
}
