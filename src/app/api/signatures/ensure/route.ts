import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

const DANIEL = {
  name: 'DANIEL COSTA LADEIRA',
  email: 'dladadeiradv@gmail.com',
  phone: '5527997940089',
  role: 'advogado',
};

const cleanPhone = (v: string) => String(v || '').replace(/\D/g, '');

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const body = await req.json().catch(() => ({}));
  const generatedContractId = String(body?.generatedContractId || '').trim();
  if (!generatedContractId) return NextResponse.json({ ok: false, error: 'Documento gerado não informado.' }, { status: 400 });

  const db = createAdminSupabase();
  const { data: generated, error: generatedError } = await db
    .from('generated_contracts')
    .select('id,client_id,client_name,phone,email,document_id,pdf_filename,zapsign_url')
    .eq('id', generatedContractId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();
  if (generatedError) return NextResponse.json({ ok: false, error: generatedError.message }, { status: 500 });
  if (!generated) return NextResponse.json({ ok: false, error: 'Documento gerado não encontrado.' }, { status: 404 });
  if (!generated.document_id) return NextResponse.json({ ok: false, error: 'O documento não está vinculado ao arquivo do AdvOS.' }, { status: 400 });

  const { data: doc } = await db.from('documents').select('id,title,signature_request_id,signature_status,law_firm_id').eq('id', generated.document_id).eq('law_firm_id', profile.law_firm_id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: 'Documento não encontrado.' }, { status: 404 });

  // 1) Use an existing native signature request whenever possible.
  let requestRow: any = null;
  if (doc.signature_request_id) {
    const { data } = await db.from('signature_requests').select('id,public_token,status,expires_at').eq('id', doc.signature_request_id).eq('law_firm_id', profile.law_firm_id).maybeSingle();
    requestRow = data || null;
  }
  if (!requestRow) {
    const { data } = await db.from('signature_requests').select('id,public_token,status,expires_at').eq('document_id', doc.id).eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    requestRow = data || null;
  }

  const validExisting = requestRow && requestRow.public_token && (!requestRow.expires_at || new Date(requestRow.expires_at).getTime() > Date.now()) && !['cancelada','cancelado','expirada','expired'].includes(String(requestRow.status || '').toLowerCase());

  if (!validExisting) {
    const clientToken = crypto.randomBytes(28).toString('base64url');
    const danielToken = '';
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: created, error } = await db.from('signature_requests').insert({
      law_firm_id: profile.law_firm_id,
      document_id: doc.id,
      public_token: clientToken,
      status: 'pendente',
      require_selfie: true,
      require_document_photo: false,
      require_otp: true,
      consent_text: 'Autorizo a coleta e o tratamento das informações e imagens estritamente necessários para comprovar minha identidade e minha assinatura neste documento.',
      expires_at: expiresAt,
      created_by: session.user.id,
    }).select('id,public_token,status,expires_at').single();
    if (error || !created) return NextResponse.json({ ok: false, error: error?.message || 'Não foi possível criar a solicitação de assinatura.' }, { status: 400 });
    requestRow = created;

    await db.from('signature_signers').delete().eq('request_id', requestRow.id).eq('law_firm_id', profile.law_firm_id);
    const clientPhone = cleanPhone(generated.phone || '');
    const { error: cErr } = await db.from('signature_signers').insert({ law_firm_id: profile.law_firm_id, request_id: requestRow.id, signer_token: clientToken, signer_order: 1, name: generated.client_name, email: generated.email || null, phone: clientPhone || null, role: 'cliente', status: 'pendente' });
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });
    const { error: dErr } = await db.from('signature_signers').insert({ law_firm_id: profile.law_firm_id, request_id: requestRow.id, signer_token: null, signer_order: 2, name: DANIEL.name, email: DANIEL.email, phone: DANIEL.phone, role: DANIEL.role, status: 'pendente' });
    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 400 });
    await db.from('documents').update({ signature_request_id: requestRow.id, signature_status: 'pendente' }).eq('id', doc.id).eq('law_firm_id', profile.law_firm_id);
    const signatureUrl = `${new URL(req.url).origin}/assinar/${clientToken}`;
    await db.from('document_signatures').upsert({ law_firm_id: profile.law_firm_id, document_id: doc.id, provider: 'advos', signer_name: generated.client_name, signer_email: generated.email || null, signer_phone: generated.phone || null, sent_at: new Date().toISOString(), status: 'pendente', external_id: requestRow.id, signature_url: signatureUrl, raw_payload: { provider: 'advos', signature_request_id: requestRow.id } }, { onConflict: 'document_id,provider' });
    await db.from('generated_contracts').update({ zapsign_url: signatureUrl, zapsign_status: 'pendente' }).eq('id', generated.id).eq('law_firm_id', profile.law_firm_id);
  }

  const { data: signer } = await db.from('signature_signers').select('signer_token,name,phone').eq('request_id', requestRow.id).eq('law_firm_id', profile.law_firm_id).eq('signer_order', 1).maybeSingle();
  const token = String(signer?.signer_token || requestRow.public_token || '').trim();
  if (!token) return NextResponse.json({ ok: false, error: 'Não foi possível obter o token do assinante.' }, { status: 500 });
  const signatureUrl = `${new URL(req.url).origin}/assinar/${token}`;
  return NextResponse.json({ ok: true, signatureUrl, requestId: requestRow.id, phone: cleanPhone(signer?.phone || generated.phone || '') });
}
