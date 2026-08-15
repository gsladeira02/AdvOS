import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppText } from '@/lib/whatsappApi';

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const documentId = String(f.get('documentId') || '').trim();
  const signer = { name: String(f.get('signer[name]') || ''), email: String(f.get('signer[email]') || ''), phone: String(f.get('signer[phone]') || ''), cpf: String(f.get('signer[cpf]') || ''), role: 'signatario' };
  const body = { requireSelfie: f.get('requireSelfie') !== null, requireDocumentPhoto: f.get('requireDocumentPhoto') !== null, requireOtp: f.get('requireOtp') !== null };
  if (!documentId || !String(signer.name || '').trim()) return NextResponse.json({ ok:false, error:'Documento e nome do signatário são obrigatórios.' }, { status:400 });
  const admin = createAdminSupabase();
  const { data: doc } = await admin.from('documents').select('id,title,storage_path,law_firm_id').eq('id', documentId).eq('law_firm_id', profile.law_firm_id).maybeSingle();
  if (!doc) return NextResponse.json({ ok:false, error:'Documento não encontrado.' }, { status:404 });
  if (!doc.storage_path) return NextResponse.json({ ok:false, error:'O documento precisa estar armazenado no AdvOS.' }, { status:400 });
  const token = crypto.randomBytes(28).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: requestRow, error } = await admin.from('signature_requests').insert({
    law_firm_id: profile.law_firm_id,
    document_id: doc.id,
    public_token: token,
    status: 'pendente',
    require_selfie: body.requireSelfie !== false,
    require_document_photo: Boolean(body.requireDocumentPhoto),
    require_otp: body.requireOtp !== false,
    consent_text: 'Autorizo a coleta e o tratamento das informações e imagens estritamente necessários para comprovar minha identidade e minha assinatura neste documento.',
    expires_at: expiresAt,
    created_by: session.user.id,
  }).select('id,public_token').single();
  if (error || !requestRow) return NextResponse.json({ ok:false, error:error?.message || 'Não foi possível criar a solicitação.' }, { status:400 });
  const { data: signerRow, error: signerError } = await admin.from('signature_signers').insert({
    law_firm_id: profile.law_firm_id,
    request_id: requestRow.id,
    name: String(signer.name).trim(),
    email: String(signer.email || '').trim() || null,
    phone: String(signer.phone || '').replace(/\D/g,'') || null,
    cpf: String(signer.cpf || '').replace(/\D/g,'') || null,
    role: String(signer.role || 'signatario'),
  }).select('id').single();
  if (signerError || !signerRow) return NextResponse.json({ ok:false, error:signerError?.message || 'Não foi possível cadastrar o signatário.' }, { status:400 });
  await admin.from('documents').update({ signature_request_id: requestRow.id, signature_status:'pendente' }).eq('id',doc.id).eq('law_firm_id',profile.law_firm_id);
  await admin.from('activity_logs').insert({ law_firm_id:profile.law_firm_id, auth_user_id:session.user.id, action:'criou_solicitacao_assinatura', entity:'signature_requests', entity_id:requestRow.id, metadata:{document_id:doc.id, signer_id:signerRow.id, require_selfie:body.requireSelfie !== false} });
  const signUrl = `${new URL(req.url).origin}/assinar/${requestRow.public_token}`;
  try { await sendWhatsAppText({lawFirmId:profile.law_firm_id,to:String(signer.phone).replace(/\D/g,''),message:`Olá! O escritório Ladeira Advogados enviou o documento “${doc.title}” para assinatura. Acesse: ${signUrl}`,sentBy:session.user.id}); } catch { /* o link continua disponível no painel */ }
  return NextResponse.redirect(`${new URL(req.url).origin}/app/assinaturas?token=${requestRow.public_token}`,303);
}
