-- AdvOS v9.84.7 - identidade e evidências finais
alter table public.signature_signers add column if not exists cpf text;
alter table public.signature_events add column if not exists ip text;
alter table public.signature_events add column if not exists user_agent text;
create index if not exists idx_signature_signers_request_order on public.signature_signers(request_id, signer_order);
