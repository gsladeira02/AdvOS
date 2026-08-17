import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppText } from '@/lib/whatsappApi';

const DANIEL = {
  name: 'DANIEL COSTA LADEIRA',
  email: 'dladadeiradv@gmail.com',
  phone: '5527997940089',
  cpf: '',
  role: 'advogado',
};

function cleanPhone(value: string) { return String(value || '').replace(/\D/g, ''); }

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const f = await req.formData();
  const documentId = String(f.get('documentId') || '').trim();
  const signer = {
    name: String(f.get('signer[name]') || '').trim(),
    email: String(f.get('signer[email]') || '').trim(),
    phone: cleanPhone(String(f.get('signer[phone]') || '')),
    cpf: String(f.get('signer[cpf]') || '').replace(/\D/g, ''),
  };
  const body = {
    requireSelfie: f.get('requireSelfie') !== null,
    requireDocumentPhoto: f.get('requireDocumentPhoto') !== null,
    requireOtp: f.get('requireOtp') !== null,
  };
  if (!documentId || !signer.name) return NextResponse.json({ ok:false, error:'Documento e dados do cliente são obrigatórios.' }, { status:400 });
  if (!signer.phone) return NextResponse.json({ ok:false, error:'O WhatsApp do cliente é obrigatório para enviar o link pela API.' }, { status:400 });

  const admin = createAdminSupabase();
  const { data: doc } = await admin.from('documents').select('id,title,storage_path,law_firm_id').eq('id', documentId).eq('law_firm_id', profile.law_firm_id).maybeSingle();
  if (!doc) return NextResponse.json({ ok:false, error:'Documento não encontrado.' }, { status:404 });
  if (!doc.storage_path) return NextResponse.json({ ok:false, error:'O documento precisa estar armazenado no AdvOS.' }, { status:400 });

  const clientToken = crypto.randomBytes(28).toString('base64url');
  const danielToken = crypto.randomBytes(28).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: requestRow, error } = await admin.from('signature_requests').insert({
    law_firm_id: profile.law_firm_id,
    document_id: doc.id,
    public_token: clientToken,
    status: 'pendente',
    require_selfie: body.requireSelfie !== false,
    require_document_photo: Boolean(body.requireDocumentPhoto),
    require_otp: body.requireOtp !== false,
    consent_text: 'Autorizo a coleta e o tratamento das informações e imagens estritamente necessários para comprovar minha identidade e minha assinatura neste documento.',
    expires_at: expiresAt,
    created_by: session.user.id,
  }).select('id,public_token').single();
  if (error || !requestRow) return NextResponse.json({ ok:false, error:error?.message || 'Não foi possível criar a solicitação.' }, { status:400 });

  const { data: clientSigner, error: clientError } = await admin.from('signature_signers').insert({
    law_firm_id: profile.law_firm_id, request_id: requestRow.id, signer_token: clientToken, signer_order: 1,
    name: signer.name, email: signer.email || null, phone: signer.phone, cpf: signer.cpf || null, role: 'cliente',
  }).select('id').single();
  if (clientError || !clientSigner) return NextResponse.json({ ok:false, error:clientError?.message || 'Não foi possível cadastrar o cliente como signatário.' }, { status:400 });

  const { data: danielSigner, error: danielError } = await admin.from('signature_signers').insert({
    law_firm_id: profile.law_firm_id, request_id: requestRow.id, signer_token: danielToken, signer_order: 2,
    name: DANIEL.name, email: DANIEL.email, phone: DANIEL.phone, cpf: null, role: DANIEL.role,
  }).select('id').single();
  if (danielError || !danielSigner) return NextResponse.json({ ok:false, error:danielError?.message || 'Não foi possível cadastrar Daniel Costa Ladeira como signatário.' }, { status:400 });

  await admin.from('documents').update({ signature_request_id: requestRow.id, signature_status:'pendente' }).eq('id',doc.id).eq('law_firm_id',profile.law_firm_id);
  await admin.from('activity_logs').insert({ law_firm_id:profile.law_firm_id, auth_user_id:session.user.id, action:'criou_solicitacao_assinatura_dois_signatarios', entity:'signature_requests', entity_id:requestRow.id, metadata:{document_id:doc.id, client_signer_id:clientSigner.id, daniel_signer_id:danielSigner.id} });

  const signUrl = `${new URL(req.url).origin}/assinar/${clientToken}`;
  let whatsappSent = false;
  let whatsappError = '';
  try {
    await sendWhatsAppText({
      lawFirmId:profile.law_firm_id,
      to:signer.phone,
      clientId:null,
      sentBy:session.user.id,
      message:`Olá, ${signer.name}! O escritório Ladeira Advogados enviou o documento “${doc.title}” para assinatura. Acesse o link seguro para assinar: ${signUrl}`,
    });
    whatsappSent = true;
    await admin.from('signature_events').insert({ law_firm_id:profile.law_firm_id, request_id:requestRow.id, signer_id:clientSigner.id, event_type:'link_enviado_whatsapp_api', metadata:{to:signer.phone} });
  } catch (e:any) {
    whatsappError = String(e?.message || 'Falha no envio pela API do WhatsApp.');
  }

  const redirect = new URL('/app/assinaturas', req.url);
  redirect.searchParams.set('token', requestRow.public_token);
  redirect.searchParams.set('whatsapp', whatsappSent ? 'enviado' : 'erro');
  if (whatsappError) redirect.searchParams.set('erro', whatsappError.slice(0, 180));
  redirect.searchParams.set('daniel', danielToken);
  return NextResponse.redirect(redirect,303);
}
