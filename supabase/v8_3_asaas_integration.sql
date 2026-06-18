-- AdvOS V8.3 - Integração Asaas reforçada
-- Rode este SQL se a tabela integration_settings/webhook_events ainda não tiver sido criada por migrações anteriores.

alter table integration_settings add column if not exists webhook_secret text;
alter table integration_settings add column if not exists default_billing_type text default 'BOLETO';
alter table integration_settings add column if not exists notes text;
alter table integration_settings add column if not exists status text default 'pendente';
alter table integration_settings add column if not exists updated_at timestamptz default now();

alter table financial_installments add column if not exists provider text;
alter table financial_installments add column if not exists external_id text;
alter table financial_installments add column if not exists payment_url text;
alter table financial_installments add column if not exists invoice_url text;
alter table financial_installments add column if not exists bank_slip_url text;
alter table financial_installments add column if not exists pix_qr_code text;
alter table financial_installments add column if not exists pix_payload text;
alter table financial_installments add column if not exists billing_type text;
alter table financial_installments add column if not exists integration_status text;
alter table financial_installments add column if not exists raw_payload jsonb;
alter table financial_installments add column if not exists paid_at date;
alter table financial_installments add column if not exists updated_at timestamptz default now();

alter table clients add column if not exists asaas_customer_id text;

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

alter table webhook_events enable row level security;
drop policy if exists "webhook_events_same_firm_all" on webhook_events;
create policy "webhook_events_same_firm_all" on webhook_events for all using (law_firm_id = public.current_law_firm_id()) with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_financial_installments_external_id on financial_installments(external_id);
create index if not exists idx_clients_asaas_customer_id on clients(asaas_customer_id);
create index if not exists idx_webhook_events_provider_created on webhook_events(provider, created_at desc);
