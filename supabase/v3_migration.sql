-- AdvOS V3 migration
-- Rode este arquivo se você já rodou o schema da V1/V2 anteriormente.

create extension if not exists "uuid-ossp";

alter table clients add column if not exists asaas_customer_id text;
alter table documents add column if not exists zapsign_doc_token text;
alter table documents add column if not exists signature_status text default 'sem_assinatura';
alter table document_signatures add column if not exists external_id text;
alter table document_signatures add column if not exists signer_phone text;
alter table document_signatures add column if not exists raw_payload jsonb;
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
alter table financial_installments add column if not exists updated_at timestamptz default now();

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

alter table integration_settings enable row level security;
alter table webhook_events enable row level security;

create index if not exists idx_document_signatures_external_id on document_signatures(external_id);
create index if not exists idx_financial_installments_external_id on financial_installments(external_id);
create index if not exists idx_clients_asaas_customer_id on clients(asaas_customer_id);
create index if not exists idx_webhook_events_provider_event on webhook_events(provider, event_id);
