-- AdvOS v9.57 — Qualificação e atribuição automática de leads (Meta Ads + Google Ads)
-- Execute uma vez no SQL Editor do Supabase antes de ativar o rastreamento do Google.

begin;

-- Dados de aquisição persistidos diretamente no lead para leitura rápida no atendimento.
alter table public.whatsapp_leads
  add column if not exists source_platform text,
  add column if not exists source_channel text,
  add column if not exists campaign_id text,
  add column if not exists campaign_name text,
  add column if not exists adset_id text,
  add column if not exists adset_name text,
  add column if not exists adgroup_id text,
  add column if not exists adgroup_name text,
  add column if not exists ad_id text,
  add column if not exists ad_name text,
  add column if not exists creative_id text,
  add column if not exists click_id text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists source_url text,
  add column if not exists referral_headline text,
  add column if not exists referral_body text,
  add column if not exists first_message text,
  add column if not exists qualification_score integer not null default 0,
  add column if not exists qualification_reasons text[] not null default '{}'::text[],
  add column if not exists qualified_automatically boolean not null default false,
  add column if not exists attribution_data jsonb not null default '{}'::jsonb;

alter table public.whatsapp_leads
  drop constraint if exists whatsapp_leads_qualification_score_check;
alter table public.whatsapp_leads
  add constraint whatsapp_leads_qualification_score_check
  check (qualification_score between 0 and 100);

create index if not exists idx_whatsapp_leads_source_platform
  on public.whatsapp_leads(law_firm_id, source_platform, created_at desc);
create index if not exists idx_whatsapp_leads_campaign_id
  on public.whatsapp_leads(law_firm_id, campaign_id)
  where campaign_id is not null;
create index if not exists idx_whatsapp_leads_ad_id
  on public.whatsapp_leads(law_firm_id, ad_id)
  where ad_id is not null;
create index if not exists idx_whatsapp_leads_gclid
  on public.whatsapp_leads(law_firm_id, gclid)
  where gclid is not null;

-- A etapa usada pela qualificação automática precisa existir e estar aberta.
insert into public.whatsapp_lead_stages (law_firm_id, stage_key, name, color, sort_order, active, outcome)
select id, 'qualificado', 'Qualificado', 'violet', 30, true, 'open'
from public.law_firms
on conflict (law_firm_id, stage_key) do update
set active = true,
    outcome = 'open',
    updated_at = now();

-- Chave pública por escritório para a URL intermediária usada nos anúncios do Google.
create table if not exists public.lead_tracking_settings (
  law_firm_id uuid primary key references public.law_firms(id) on delete cascade,
  public_token uuid not null default uuid_generate_v4() unique,
  meta_tracking_enabled boolean not null default true,
  google_tracking_enabled boolean not null default true,
  auto_qualify_paid_leads boolean not null default true,
  google_default_message text not null default 'Olá! Gostaria de falar com um advogado.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.lead_tracking_settings (law_firm_id)
select id from public.law_firms
on conflict (law_firm_id) do nothing;

-- Cada clique no link rastreado do Google recebe uma referência curta que segue
-- no texto pré-preenchido do WhatsApp. Ao chegar a mensagem, a referência liga
-- o contato ao GCLID/ValueTrack sem depender de cookie no WhatsApp.
create table if not exists public.lead_tracking_clicks (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  public_ref text not null unique,
  provider text not null default 'google_ads',
  gclid text,
  gbraid text,
  wbraid text,
  campaign_id text,
  campaign_name text,
  adgroup_id text,
  adgroup_name text,
  ad_id text,
  ad_name text,
  creative_id text,
  keyword text,
  match_type text,
  network text,
  device text,
  placement text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  raw_params jsonb not null default '{}'::jsonb,
  matched_conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  matched_lead_id uuid references public.whatsapp_leads(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  constraint lead_tracking_clicks_provider_check check (provider in ('google_ads'))
);

create index if not exists idx_lead_tracking_clicks_firm_created
  on public.lead_tracking_clicks(law_firm_id, created_at desc);
create index if not exists idx_lead_tracking_clicks_gclid
  on public.lead_tracking_clicks(law_firm_id, gclid)
  where gclid is not null;

alter table public.lead_tracking_settings enable row level security;
alter table public.lead_tracking_clicks enable row level security;
revoke all on table public.lead_tracking_settings from public, anon, authenticated;
revoke all on table public.lead_tracking_clicks from public, anon, authenticated;
grant all privileges on table public.lead_tracking_settings to service_role;
grant all privileges on table public.lead_tracking_clicks to service_role;

notify pgrst, 'reload schema';
commit;
