import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

async function resolveSignerWithPublicToken(db: any, signerId: string, token: string) {
  const { data: signer } = await db
    .from('signature_signers')
    .select('id,request_id,law_firm_id,name,phone,email,status,role,signer_token,signer_order')
    .eq('id', signerId)
    .maybeSingle();
  if (!signer) return null;

  const { data: request } = await db
    .from('signature_requests')
    .select('id,law_firm_id,public_token,status,expires_at,require_selfie,require_document_photo,require_otp')
    .eq('id', signer.request_id)
    .maybeSingle();
  if (!request) return null;

  const provided = String(token || '').trim();
  const publicValid = String(request.public_token || '').trim() === provided;
  const legacyValid = String(signer.signer_token || '').trim() === provided;
  if (!publicValid && !legacyValid) return null;

  // A página pública só pode representar o signatário cliente (ordem 1).
  if (String(signer.role || '').toLowerCase() === 'advogado') return null;
  if (Number(signer.signer_order) !== 1) return null;

  return { signer, request };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const signerId = String(body?.signerId || '').trim();
    const token = String(body?.token || '').trim();
    if (!signerId || !token) {
      return NextResponse.json({ ok: false, error: 'Dados da assinatura incompletos.' }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const resolved = await resolveSignerWithPublicToken(admin, signerId, token);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: 'Assinante inválido.' }, { status: 404 });
    }

    const { signer, request } = resolved;
    if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Link expirado.' }, { status: 410 });
    }

    await admin.from('signature_events').insert({
      law_firm_id: signer.law_firm_id,
      request_id: signer.request_id,
      signer_id: signer.id,
      event_type: 'documento_visualizado',
      metadata: { source: 'public_signature_page' },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || 'Não foi possível registrar a visualização.') },
      { status: 500 },
    );
  }
}
