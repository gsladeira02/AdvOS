-- AdvOS v9.80 — assinatura obrigatória: cliente + Daniel Costa Ladeira
alter table public.signature_signers add column if not exists signer_token text;
alter table public.signature_signers add column if not exists signer_order integer not null default 1;
create unique index if not exists uq_signature_signers_token on public.signature_signers(signer_token) where signer_token is not null;
create index if not exists idx_signature_signers_request_order on public.signature_signers(request_id, signer_order);
update public.signature_signers
set signer_order = 1
where signer_order is null;
