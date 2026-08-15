-- AdvOS v9.82 — assinatura eletrônica sem desenho manual + leitura obrigatória + assinatura do escritório autenticada
alter table public.signature_signers add column if not exists viewed_at timestamptz;
create index if not exists idx_signature_signers_viewed_at on public.signature_signers(request_id, viewed_at);

-- O signatário do escritório não usa link/token público.
update public.signature_signers
set signer_token = null
where signer_order = 2 or role = 'advogado';

-- Reforça que apenas o cliente possui token público.
drop index if exists public.uq_signature_signers_token;
create unique index if not exists uq_signature_signers_client_token
  on public.signature_signers(signer_token)
  where signer_token is not null and signer_order = 1;
