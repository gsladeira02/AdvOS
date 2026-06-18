-- AdvOS V4 migration
-- Rode este arquivo se você já está usando a V3 e quer adicionar a aba Contratos e Procurações.

create extension if not exists "uuid-ossp";

create table if not exists generated_contracts (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  generated_by uuid references auth.users(id) on delete set null,
  document_type text not null,
  client_name text not null,
  civil_status text,
  profession text,
  rg text,
  rg_uf text,
  cpf text,
  address text,
  phone text,
  email text,
  local text,
  contract_date date,
  object text,
  attorneys text,
  total_amount numeric(14,2) default 0,
  entry_amount numeric(14,2) default 0,
  entry_date date,
  installment_count integer default 0,
  installment_amount numeric(14,2) default 0,
  due_day integer,
  has_hypo boolean default false,
  created_at timestamptz not null default now()
);

alter table generated_contracts enable row level security;

drop policy if exists "generated_contracts_same_firm_all" on generated_contracts;
create policy "generated_contracts_same_firm_all" on generated_contracts
  for all using (law_firm_id = public.current_law_firm_id())
  with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_generated_contracts_law_firm_created on generated_contracts(law_firm_id, created_at desc);
create index if not exists idx_generated_contracts_client on generated_contracts(client_id);
