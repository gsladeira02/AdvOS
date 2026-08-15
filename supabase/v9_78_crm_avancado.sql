-- AdvOS v9.78 — CRM jurídico avançado
alter table public.whatsapp_leads add column if not exists estimated_value numeric(14,2) default 0;
alter table public.whatsapp_leads add column if not exists probability integer default 50;
alter table public.whatsapp_leads add column if not exists responsible text;
alter table public.whatsapp_leads add column if not exists next_action text;
alter table public.whatsapp_leads add column if not exists next_action_at timestamptz;
alter table public.whatsapp_leads add column if not exists loss_reason text;
alter table public.whatsapp_leads add column if not exists first_response_at timestamptz;
alter table public.whatsapp_leads add column if not exists proposal_at timestamptz;
alter table public.whatsapp_leads add column if not exists contracted_at timestamptz;

create table if not exists public.lead_stage_history (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  lead_id uuid not null references public.whatsapp_leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_stage_history_lead on public.lead_stage_history(lead_id, created_at desc);
alter table public.lead_stage_history enable row level security;
revoke all on table public.lead_stage_history from public, anon, authenticated;
grant all privileges on table public.lead_stage_history to service_role;
