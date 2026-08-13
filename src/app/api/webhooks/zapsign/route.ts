import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, safeEqual, SecurityError } from '@/lib/security';

function statusFromEvent(payload: any) {
  const event = String(payload?.event_type || payload?.event || payload?.type || '').toLowerCase();
  if (event.includes('signed')) return 'assinado';
  if (event.includes('refused')) return 'recusado';
  if (event.includes('deleted')) return 'excluido';
  if (event.includes('created')) return 'enviado';
  return event || payload?.status || 'atualizado';
}

export async function POST(req: Request) {
  try {
    const receivedToken = req.headers.get('x-advos-webhook-token') || '';
    if (!receivedToken) return NextResponse.json({ ok: false }, { status: 401 });

    const admin = createAdminSupabase();
    const { data: configs } = await admin
      .from('integration_settings')
      .select('law_firm_id,webhook_secret')
      .eq('provider', 'zapsign')
      .eq('enabled', true);

    const config = (configs || []).find((row: any) => safeEqual(receivedToken, row.webhook_secret));
    if (!config?.law_firm_id) return NextResponse.json({ ok: false }, { status: 401 });

    const payload: any = await readJsonBody(req, 1024 * 1024);
    const externalId = String(payload?.token || payload?.doc_token || payload?.document?.token || payload?.document_token || '').trim();
    const status = statusFromEvent(payload);

    if (externalId) {
      const { data: signature } = await admin
        .from('document_signatures')
        .select('id,law_firm_id,document_id')
        .eq('law_firm_id', config.law_firm_id)
        .eq('external_id', externalId)
        .maybeSingle();

      if (signature) {
        await admin.from('document_signatures').update({
          status,
          signed_at: status === 'assinado' ? new Date().toISOString() : null,
          signed_document_url: payload?.signed_file || payload?.document?.signed_file || null,
          raw_payload: payload,
        }).eq('id', signature.id).eq('law_firm_id', config.law_firm_id);

        if (signature.document_id) {
          await admin.from('documents').update({ signature_status: status })
            .eq('id', signature.document_id)
            .eq('law_firm_id', config.law_firm_id);
        }
      }
    }

    await admin.from('webhook_events').insert({
      law_firm_id: config.law_firm_id,
      provider: 'zapsign',
      event_id: payload?.id || externalId || null,
      event_type: payload?.event_type || payload?.event || payload?.type || null,
      payload,
      processed_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false }, { status });
  }
}
