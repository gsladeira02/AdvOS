import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

function statusFromEvent(payload: any) {
  const event = String(payload?.event_type || payload?.event || payload?.type || '').toLowerCase();
  if (event.includes('signed')) return 'assinado';
  if (event.includes('refused')) return 'recusado';
  if (event.includes('deleted')) return 'excluido';
  if (event.includes('created')) return 'enviado';
  return event || payload?.status || 'atualizado';
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const admin = createAdminSupabase();
  const externalId = payload?.token || payload?.doc_token || payload?.document?.token || payload?.document_token;
  const status = statusFromEvent(payload);

  let lawFirmId: string | null = null;
  if (externalId) {
    const { data: signature } = await admin
      .from('document_signatures')
      .select('id,law_firm_id,document_id')
      .eq('external_id', externalId)
      .maybeSingle();

    if (signature) {
      lawFirmId = signature.law_firm_id;
      await admin.from('document_signatures').update({
        status,
        signed_at: status === 'assinado' ? new Date().toISOString() : null,
        signed_document_url: payload?.signed_file || payload?.document?.signed_file || null,
        raw_payload: payload,
      }).eq('id', signature.id);

      await admin.from('documents').update({ signature_status: status }).eq('id', signature.document_id);
    }
  }

  await admin.from('webhook_events').insert({
    law_firm_id: lawFirmId,
    provider: 'zapsign',
    event_id: payload?.id || externalId || null,
    event_type: payload?.event_type || payload?.event || payload?.type || null,
    payload,
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
