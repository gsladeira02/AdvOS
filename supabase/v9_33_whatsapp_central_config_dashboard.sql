-- AdvOS v9.33 — Central de Configurações e Dashboard do WhatsApp
-- Migração aditiva e compatível com v9.32.

begin;

-- 1) Catálogo central de tags
create table if not exists public.whatsapp_tags (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  name text not null,
  color text not null default 'slate',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_tags_name_ci
  on public.whatsapp_tags(law_firm_id, lower(name));
create index if not exists idx_whatsapp_tags_order
  on public.whatsapp_tags(law_firm_id, active desc, sort_order, name);

alter table public.whatsapp_tags enable row level security;
revoke all on table public.whatsapp_tags from public, anon, authenticated;
grant all privileges on table public.whatsapp_tags to service_role;

-- Importa tags livres já existentes para o catálogo.
with legacy_tags as (
  select c.law_firm_id, lower(trim(t.tag)) as normalized_name, min(trim(t.tag)) as name
  from public.whatsapp_conversations c
  cross join lateral unnest(coalesce(c.tags, '{}'::text[])) as t(tag)
  where trim(t.tag) <> ''
  group by c.law_firm_id, lower(trim(t.tag))
)
insert into public.whatsapp_tags (law_firm_id, name, color, active, sort_order)
select lt.law_firm_id, lt.name, 'slate', true, 100
from legacy_tags lt
where not exists (
  select 1 from public.whatsapp_tags wt
  where wt.law_firm_id = lt.law_firm_id
    and lower(wt.name) = lt.normalized_name
);

-- Associação relacional entre conversa e tags cadastradas.
create table if not exists public.whatsapp_conversation_tags (
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  tag_id uuid not null references public.whatsapp_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id)
);

create index if not exists idx_whatsapp_conversation_tags_firm
  on public.whatsapp_conversation_tags(law_firm_id, conversation_id);
create index if not exists idx_whatsapp_conversation_tags_tag
  on public.whatsapp_conversation_tags(law_firm_id, tag_id);

alter table public.whatsapp_conversation_tags enable row level security;
revoke all on table public.whatsapp_conversation_tags from public, anon, authenticated;
grant all privileges on table public.whatsapp_conversation_tags to service_role;

insert into public.whatsapp_conversation_tags (law_firm_id, conversation_id, tag_id)
select c.law_firm_id, c.id, wt.id
from public.whatsapp_conversations c
cross join lateral unnest(coalesce(c.tags, '{}'::text[])) as t(tag)
join public.whatsapp_tags wt
  on wt.law_firm_id = c.law_firm_id
 and lower(wt.name) = lower(trim(t.tag))
where trim(t.tag) <> ''
on conflict do nothing;

-- 2) Etapas configuráveis do funil de leads.
create table if not exists public.whatsapp_lead_stages (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  stage_key text not null,
  name text not null,
  color text not null default 'amber',
  sort_order integer not null default 0,
  active boolean not null default true,
  outcome text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(law_firm_id, stage_key),
  check (outcome in ('open','won','lost'))
);

create unique index if not exists idx_whatsapp_lead_stages_name_ci
  on public.whatsapp_lead_stages(law_firm_id, lower(name));
create index if not exists idx_whatsapp_lead_stages_order
  on public.whatsapp_lead_stages(law_firm_id, active desc, sort_order, name);

alter table public.whatsapp_lead_stages enable row level security;
revoke all on table public.whatsapp_lead_stages from public, anon, authenticated;
grant all privileges on table public.whatsapp_lead_stages to service_role;

insert into public.whatsapp_lead_stages (law_firm_id, stage_key, name, color, sort_order, active, outcome)
select lf.id, s.stage_key, s.name, s.color, s.sort_order, true, s.outcome
from public.law_firms lf
cross join (values
  ('novo','Novo','sky',10,'open'),
  ('em_atendimento','Em atendimento','emerald',20,'open'),
  ('qualificado','Qualificado','violet',30,'open'),
  ('proposta','Proposta','amber',40,'open'),
  ('aguardando','Aguardando','slate',50,'open'),
  ('convertido','Convertido','green',90,'won'),
  ('perdido','Perdido','red',100,'lost')
) as s(stage_key,name,color,sort_order,outcome)
on conflict (law_firm_id, stage_key) do nothing;

-- Garante que etapas antigas/customizadas existentes também tenham configuração.
insert into public.whatsapp_lead_stages (law_firm_id, stage_key, name, color, sort_order, active, outcome)
select distinct l.law_firm_id,
  l.stage,
  initcap(replace(l.stage, '_', ' ')),
  'slate',
  70,
  true,
  case when l.stage = 'convertido' then 'won' when l.stage = 'perdido' then 'lost' else 'open' end
from public.whatsapp_leads l
where coalesce(trim(l.stage), '') <> ''
  and not exists (
    select 1 from public.whatsapp_lead_stages s
    where s.law_firm_id = l.law_firm_id and s.stage_key = l.stage
  );

-- Remove o CHECK fixo da v9.32 para permitir etapas cadastradas pelo escritório.
alter table public.whatsapp_leads
  drop constraint if exists whatsapp_leads_stage_check;

-- 3) Preferências da Central do WhatsApp
create table if not exists public.whatsapp_preferences (
  law_firm_id uuid primary key references public.law_firms(id) on delete cascade,
  lead_label_singular text not null default 'Lead',
  lead_label_plural text not null default 'Leads',
  default_lead_stage_key text not null default 'novo',
  default_department text not null default 'atendimento',
  auto_save_client_media boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_department in ('atendimento','financeiro_juridico'))
);

alter table public.whatsapp_preferences enable row level security;
revoke all on table public.whatsapp_preferences from public, anon, authenticated;
grant all privileges on table public.whatsapp_preferences to service_role;

insert into public.whatsapp_preferences (law_firm_id)
select id from public.law_firms
on conflict (law_firm_id) do nothing;

notify pgrst, 'reload schema';
commit;
