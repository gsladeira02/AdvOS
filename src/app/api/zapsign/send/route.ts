import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

function cleanPhone(v: string) {
  return v.replace(/\D/g, '').replace(/^55/, '');
}

async function saveSignature(payload: any) {
  const admin = createAdminSupabase();
  const { error } = await admin.from('document_signatures').insert(payload);
  if (error) throw new Error(error.message);
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const f = await req.formData();
  const documentId = str(f.get('document_id'));
  const signerName = str(f.get('signer_name'));
  const signerEmail = str(f.get('signer_email'));
  const signerPhone = str(f.get('signer_phone'));
  const admin = createAdminSupabase();

  const { data: doc } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });

  const config = await getIntegrationConfig(profile.law_firm_id, 'zapsign');
  const basePayload = {
    law_firm_id: profile.law_firm_id,
    document_id: doc.id,
    provider: 'zapsign',
    signer_name: signerName,
    signer_email: signerEmail || null,
    signer_phone: signerPhone || null,
    sent_at: new Date().toISOString(),
  };

  if (!config.configured) {
    await saveSignature({ ...basePayload, status: 'configuracao_pendente' });
    return NextResponse.redirect(new URL('/app/documentos?zap=configuracao', req.url), 303);
  }

  if (!doc.external_url) {
    await saveSignature({ ...basePayload, status: 'sem_pdf_publico' });
    return NextResponse.redirect(new URL('/app/documentos?zap=sem-pdf', req.url), 303);
  }

  try {
    const pdfResponse = await fetch(doc.external_url);
    if (!pdfResponse.ok) throw new Error('Não foi possível baixar o PDF informado.');
    const contentType = pdfResponse.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !doc.external_url.toLowerCase().includes('.pdf')) {
      throw new Error('O link informado não parece ser um PDF público.');
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString('base64');
    const phoneNumber = cleanPhone(signerPhone);

    const payload: any = {
      name: doc.title,
      base64_pdf: base64Pdf,
      signers: [
        {
          name: signerName,
          email: signerEmail || undefined,
          phone_country: phoneNumber ? '55' : undefined,
          phone_number: phoneNumber || undefined,
          send_automatic_email: Boolean(signerEmail),
          send_automatic_whatsapp: Boolean(phoneNumber),
        },
      ],
    };

    const response = await fetch(`${config.baseUrl}/docs/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.detail || json?.message || 'Erro ao criar documento na ZapSign.');

    const signer = Array.isArray(json?.signers) ? json.signers[0] : null;
    await admin.from('document_signatures').insert({
      ...basePayload,
      status: json?.status || 'enviado',
      external_id: json?.token || json?.open_id || json?.id || null,
      signature_url: signer?.sign_url || json?.sign_url || null,
      signed_document_url: json?.signed_file || null,
      raw_payload: json,
    });

    await admin.from('documents').update({
      zapsign_doc_token: json?.token || null,
      signature_status: json?.status || 'enviado',
    }).eq('id', doc.id).eq('law_firm_id', profile.law_firm_id);

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'enviou_zapsign',
      entity: 'documents',
      entity_id: doc.id,
    });
  } catch (error: any) {
    await saveSignature({
      ...basePayload,
      status: 'erro',
      raw_payload: { message: error?.message || 'Erro desconhecido' },
    });
  }

  return NextResponse.redirect(new URL('/app/documentos', req.url), 303);
}
