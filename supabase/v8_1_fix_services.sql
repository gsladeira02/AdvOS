-- AdvOS V8.1 - Correção dos serviços jurídicos
-- Rode este SQL se a aba Serviços abriu, mas os serviços não salvaram/listaram.

create extension if not exists "uuid-ossp";

create table if not exists legal_services (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  name text not null,
  description text,
  default_amount numeric(14,2) default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table clients add column if not exists service_id uuid references legal_services(id) on delete set null;
alter table documents add column if not exists service_id uuid references legal_services(id) on delete set null;
alter table if exists generated_contracts add column if not exists service_id uuid references legal_services(id) on delete set null;
alter table financial_contracts add column if not exists service_id uuid references legal_services(id) on delete set null;

alter table legal_services enable row level security;

drop policy if exists "legal_services_same_firm_all" on legal_services;
create policy "legal_services_same_firm_all" on legal_services
  for all using (law_firm_id = public.current_law_firm_id())
  with check (law_firm_id = public.current_law_firm_id());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on legal_services to authenticated;
grant select on legal_services to anon;
grant select, insert, update, delete on clients to authenticated;
grant select, insert, update, delete on documents to authenticated;
grant select, insert, update, delete on financial_contracts to authenticated;

drop index if exists idx_legal_services_law_firm;
create index if not exists idx_legal_services_law_firm on legal_services(law_firm_id);
create index if not exists idx_clients_service_id on clients(service_id);
create index if not exists idx_documents_service_id on documents(service_id);
create index if not exists idx_generated_contracts_service_id on generated_contracts(service_id);
create index if not exists idx_financial_contracts_service_id on financial_contracts(service_id);
