-- AdvOS V5 migration
-- Rode este arquivo se você já está usando a V4 e quer automatizar PDF + ZapSign + Asaas.

create extension if not exists "uuid-ossp";

-- Bucket para PDFs gerados. Se o bucket já existir, nada muda.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

alter table generated_contracts add column if not exists nationality text;
alter table generated_contracts add column if not exists forum text;
alter table generated_contracts add column if not exists pdf_filename text;
alter table generated_contracts add column if not exists pdf_storage_path text;
alter table generated_contracts add column if not exists document_id uuid references documents(id) on delete set null;
alter table generated_contracts add column if not exists financial_contract_id uuid references financial_contracts(id) on delete set null;
alter table generated_contracts add column if not exists zapsign_status text default 'pendente';
alter table generated_contracts add column if not exists zapsign_token text;
alter table generated_contracts add column if not exists zapsign_url text;
alter table generated_contracts add column if not exists asaas_status text default 'pendente';
alter table generated_contracts add column if not exists raw_zapsign_payload jsonb;
alter table generated_contracts add column if not exists updated_at timestamptz default now();

create index if not exists idx_generated_contracts_document_id on generated_contracts(document_id);
create index if not exists idx_generated_contracts_financial_contract_id on generated_contracts(financial_contract_id);
create index if not exists idx_generated_contracts_zapsign_token on generated_contracts(zapsign_token);

-- O upload dos PDFs é feito por API server-side com service_role.
-- Para download/preview futuro, gere signed URLs no servidor em vez de tornar o bucket público.
