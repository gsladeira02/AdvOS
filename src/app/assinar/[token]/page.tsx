import SignClient from './sign-client';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Message = ({ title, text }: { title: string; text?: string }) => (
  <main className="min-h-screen bg-slate-50 p-6">
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-black">{title}</h1>
      {text ? <p className="mt-2 text-sm text-slate-600">{text}</p> : null}
    </div>
  </main>
);

export default async function PublicSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return <Message title="Link inválido" text="A solicitação de assinatura não foi encontrada." />;

  try {
    const admin = createAdminSupabase();

    // O link do cliente usa o public_token. Ele é igual ao token do primeiro
    // signatário nas solicitações criadas pelo AdvOS, então não precisamos
    // consultar signer_token para abrir a página pública. Isso também torna
    // a página compatível com bancos que ainda não receberam a migration v9.80.
    const { data: requestRow, error: requestError } = await admin
      .from('signature_requests')
      .select('id, law_firm_id, status, expires_at, require_selfie, require_document_photo, require_otp, document_id, public_token')
      .eq('public_token', cleanToken)
      .maybeSingle();

    if (requestError) {
      return <Message title="Não foi possível abrir a assinatura" text="A configuração da assinatura ainda não está disponível. Tente novamente em alguns instantes." />;
    }
    if (!requestRow) {
      return <Message title="Link inválido" text="A solicitação de assinatura não foi encontrada." />;
    }

    if (requestRow.expires_at && new Date(requestRow.expires_at).getTime() < Date.now() && requestRow.status !== 'assinado') {
      return <Message title="Link expirado" text="Solicite um novo link ao escritório." />;
    }

    // Busca somente colunas existentes desde a v9.76. O token usado pelo
    // cliente é o próprio public_token recebido na URL.
    const { data: signer, error: signerError } = await admin
      .from('signature_signers')
      .select('id, request_id, name, phone, email, cpf, status, role, signer_order')
      .eq('request_id', requestRow.id)
      .eq('signer_order', 1)
      .maybeSingle();

    if (signerError || !signer) {
      return <Message title="Assinatura indisponível" text="O signatário do cliente ainda não foi configurado." />;
    }

    if (String(signer.role || '').toLowerCase() === 'advogado') {
      return <Message title="Assinatura do escritório" text="A assinatura de Daniel Costa Ladeira deve ser feita dentro do AdvOS." />;
    }

    const { data: doc } = await admin
      .from('documents')
      .select('title')
      .eq('id', requestRow.document_id)
      .eq('law_firm_id', requestRow.law_firm_id)
      .maybeSingle();

    return (
      <SignClient
        token={cleanToken}
        requestId={requestRow.id}
        signerId={signer.id}
        title={doc?.title || 'Documento'}
        signer={signer}
        settings={{
          requireSelfie: Boolean(requestRow.require_selfie),
          requireDocumentPhoto: Boolean(requestRow.require_document_photo),
          requireOtp: Boolean(requestRow.require_otp),
        }}
        status={requestRow.status}
      />
    );
  } catch (error) {
    console.error('[AdvOS] erro na página pública de assinatura:', error);
    return <Message title="Não foi possível abrir a assinatura" text="Ocorreu um erro temporário ao carregar o documento." />;
  }
}
