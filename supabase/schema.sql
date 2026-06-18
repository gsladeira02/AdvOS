-- AdvOS V3 - Supabase schema completo
-- Para instalação nova: rode este arquivo no Supabase SQL Editor.
-- Para projeto que já rodou V1/V2: rode supabase/v3_migration.sql.

create extension if not exists "uuid-ossp";

create table if not exists law_firms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  cnpj text,
  oab_responsible text,
  phone text,
  email text,
  address text,
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role text not null default 'membro',
  oab_number text,
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  plan text not null default 'interno',
  status text not null default 'ativa',
  current_period_start date default current_date,
  current_period_end date default (current_date + interval '30 days')::date,
  grace_until date default (current_date + interval '33 days')::date,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  name text not null,
  doc text,
  client_type text,
  phone text,
  whatsapp text,
  email text,
  address text,
  notes text,
  asaas_customer_id text,
  created_at timestamptz not null default now()
);

create table if not exists cases (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  case_number text,
  area text,
  action_type text,
  court text,
  district text,
  opposing_party text,
  responsible text,
  phase text,
  status text default 'ativo',
  claim_value numeric(14,2) default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists case_parties (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  case_id uuid references cases(id) on delete cascade,
  name text not null,
  party_type text,
  doc text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists deadlines (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  description text,
  due_date date not null,
  responsible text,
  priority text default 'normal',
  status text default 'pendente',
  created_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  title text not null,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  title text not null,
  doc_type text,
  storage_path text,
  external_url text,
  zapsign_doc_token text,
  signature_status text default 'sem_assinatura',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists document_signatures (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  provider text default 'zapsign',
  external_id text,
  status text default 'preparado',
  signature_url text,
  signed_document_url text,
  signer_name text,
  signer_email text,
  signer_phone text,
  sent_at timestamptz,
  signed_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists financial_contracts (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  description text not null,
  total_amount numeric(14,2) default 0,
  status text default 'ativo',
  created_at timestamptz not null default now()
);

create table if not exists financial_installments (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  contract_id uuid references financial_contracts(id) on delete cascade,
  amount numeric(14,2) default 0,
  due_date date,
  paid_at date,
  status text default 'pendente',
  provider text,
  external_id text,
  payment_url text,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_payload text,
  billing_type text,
  integration_status text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  title text not null,
  description text,
  responsible text,
  due_date date,
  priority text default 'normal',
  status text default 'pendente',
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid references law_firms(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists integration_settings (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  provider text not null,
  enabled boolean not null default false,
  environment text not null default 'sandbox',
  api_token text,
  token_last4 text,
  api_base_url text,
  webhook_secret text,
  default_billing_type text,
  status text default 'pendente',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(law_firm_id, provider)
);

create table if not exists webhook_events (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid references law_firms(id) on delete set null,
  provider text not null,
  event_id text,
  event_type text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.current_law_firm_id()
returns uuid language sql stable security definer as $$
  select law_firm_id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

alter table law_firms enable row level security;
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table clients enable row level security;
alter table cases enable row level security;
alter table case_parties enable row level security;
alter table deadlines enable row level security;
alter table calendar_events enable row level security;
alter table documents enable row level security;
alter table document_signatures enable row level security;
alter table financial_contracts enable row level security;
alter table financial_installments enable row level security;
alter table tasks enable row level security;
alter table activity_logs enable row level security;
alter table integration_settings enable row level security;
alter table webhook_events enable row level security;

drop policy if exists "law_firms_same_firm_select" on law_firms;
drop policy if exists "profiles_same_firm_all" on profiles;
drop policy if exists "subscriptions_same_firm_select" on subscriptions;
drop policy if exists "clients_same_firm_all" on clients;
drop policy if exists "cases_same_firm_all" on cases;
drop policy if exists "case_parties_same_firm_all" on case_parties;
drop policy if exists "deadlines_same_firm_all" on deadlines;
drop policy if exists "calendar_events_same_firm_all" on calendar_events;
drop policy if exists "documents_same_firm_all" on documents;
drop policy if exists "document_signatures_same_firm_all" on document_signatures;
drop policy if exists "financial_contracts_same_firm_all" on financial_contracts;
drop policy if exists "financial_installments_same_firm_all" on financial_installments;
drop policy if exists "tasks_same_firm_all" on tasks;
drop policy if exists "activity_logs_same_firm_all" on activity_logs;

create policy "law_firms_same_firm_select" on law_firms for select using (id = public.current_law_firm_id());
create policy "profiles_same_firm_all" on profiles for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "subscriptions_same_firm_select" on subscriptions for select using (law_firm_id = public.current_law_firm_id());
create policy "clients_same_firm_all" on clients for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "cases_same_firm_all" on cases for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "case_parties_same_firm_all" on case_parties for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "deadlines_same_firm_all" on deadlines for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "calendar_events_same_firm_all" on calendar_events for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "documents_same_firm_all" on documents for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "document_signatures_same_firm_all" on document_signatures for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "financial_contracts_same_firm_all" on financial_contracts for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "financial_installments_same_firm_all" on financial_installments for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "tasks_same_firm_all" on tasks for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());
create policy "activity_logs_same_firm_all" on activity_logs for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_document_signatures_external_id on document_signatures(external_id);
create index if not exists idx_financial_installments_external_id on financial_installments(external_id);
create index if not exists idx_clients_asaas_customer_id on clients(asaas_customer_id);
create index if not exists idx_webhook_events_provider_event on webhook_events(provider, event_id);

-- Instalação inicial:
-- 1) Crie apenas o primeiro usuário em Authentication > Users.
-- 2) Entre no AdvOS com este usuário.
-- 3) Vá em Configurações para definir escritório, usuário e acesso.
-- 4) Os demais usuários são criados dentro do painel.
-- 5) Em Integrações, conecte ZapSign e Asaas quando quiser usar assinatura/cobrança real.

-- AdvOS V4 - Gerador de contratos e procurações
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
