-- AdvOS V1 - Supabase schema
-- Rode este SQL no Supabase SQL Editor.

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
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists document_signatures (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  provider text default 'zapsign',
  status text default 'preparado',
  signature_url text,
  signed_document_url text,
  signer_name text,
  signer_email text,
  sent_at timestamptz,
  signed_at timestamptz,
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
  created_at timestamptz not null default now()
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

-- Helper: retorna o escritório do usuário logado
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

-- Políticas: todos os usuários do mesmo escritório têm o mesmo nível de acesso na V1.
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

-- CONFIGURAÇÃO INICIAL DA V1
-- 1) Crie apenas o primeiro usuário em Authentication > Users.
-- 2) Faça login no AdvOS com esse usuário.
-- 3) O sistema abrirá /configuracao-inicial.
-- 4) Preencha os dados do escritório, do usuário inicial e do acesso.
-- 5) O AdvOS criará automaticamente os registros em law_firms, subscriptions e profiles.
-- 6) Os demais usuários devem ser criados dentro do painel em /app/usuarios.
