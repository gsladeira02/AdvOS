-- AdvOS V8.4 - Importação inicial do Asaas
-- Rode este SQL antes de usar a tela Integrações > Asaas > Importação inicial.

alter table financial_installments add column if not exists import_source text;
alter table financial_installments add column if not exists import_key text;
alter table financial_installments add column if not exists import_batch_id uuid;
alter table financial_installments add column if not exists raw_payload jsonb;
alter table financial_installments add column if not exists updated_at timestamptz default now();
alter table clients add column if not exists asaas_customer_id text;
alter table clients add column if not exists service_id uuid references legal_services(id) on delete set null;

create table if not exists asaas_import_batches (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  file_name text,
  import_type text default 'auto',
  inserted_clients integer default 0,
  updated_clients integer default 0,
  inserted_payments integer default 0,
  updated_payments integer default 0,
  skipped_rows integer default 0,
  errors jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table asaas_import_batches enable row level security;
drop policy if exists "asaas_import_batches_same_firm_all" on asaas_import_batches;
create policy "asaas_import_batches_same_firm_all" on asaas_import_batches
for all using (law_firm_id = public.current_law_firm_id())
with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_asaas_import_batches_firm_created on asaas_import_batches(law_firm_id, created_at desc);
create index if not exists idx_financial_installments_import_batch on financial_installments(import_batch_id);
create index if not exists idx_financial_installments_import_key on financial_installments(law_firm_id, import_key);
create index if not exists idx_clients_asaas_customer_id_v84 on clients(law_firm_id, asaas_customer_id);
