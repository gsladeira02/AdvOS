-- AdvOS v9.32 — Atendimento, Leads, Tags e Pasta do Cliente no WhatsApp
-- Migração aditiva: pode ser executada antes do deploy da v9.32.

begin;

-- 1) Setor e tags da conversa
alter table public.whatsapp_conversations
  add column if not exists department text not null default 'atendimento',
  add column if not exists tags text[] not null default '{}'::text[];

update public.whatsapp_conversations
set department = 'atendimento'
where department is null or department not in ('atendimento', 'financeiro_juridico');

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_department_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_department_check
  check (department in ('atendimento', 'financeiro_juridico'));

create index if not exists idx_whatsapp_conversations_department_last
  on public.whatsapp_conversations(law_firm_id, department, last_message_at desc);

create index if not exists idx_whatsapp_conversations_tags
  on public.whatsapp_conversations using gin(tags);

-- 2) Funil de leads. Um lead nasce da conversa, nunca vira cliente automaticamente.
create table if not exists public.whatsapp_leads (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  name text,
  phone text not null,
  email text,
  stage text not null default 'novo',
  source text not null default 'whatsapp',
  service_interest text,
  notes text,
  converted_client_id uuid references public.clients(id) on delete set null,
  converted_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(law_firm_id, conversation_id)
);

alter table public.whatsapp_leads
  drop constraint if exists whatsapp_leads_stage_check;

alter table public.whatsapp_leads
  add constraint whatsapp_leads_stage_check
  check (stage in ('novo','em_atendimento','qualificado','proposta','aguardando','convertido','perdido'));

create index if not exists idx_whatsapp_leads_firm_stage
  on public.whatsapp_leads(law_firm_id, stage, updated_at desc);

create index if not exists idx_whatsapp_leads_phone
  on public.whatsapp_leads(law_firm_id, phone);

-- Conversas antigas de números desconhecidos também entram no funil,
-- sem criar nenhum cliente automaticamente.
insert into public.whatsapp_leads (
  law_firm_id, conversation_id, name, phone, stage, source, last_contact_at
)
select
  c.law_firm_id,
  c.id,
  c.lead_name,
  c.phone,
  'novo',
  'whatsapp',
  coalesce(c.last_message_at, c.updated_at, c.created_at)
from public.whatsapp_conversations c
where c.client_id is null
  and exists (
    select 1 from public.whatsapp_messages m
    where m.conversation_id = c.id
      and m.law_firm_id = c.law_firm_id
      and m.deleted_at is null
  )
on conflict (law_firm_id, conversation_id) do nothing;

alter table public.whatsapp_leads enable row level security;

-- O navegador não acessa leads diretamente. Toda alteração passa pelo backend AdvOS.
drop policy if exists whatsapp_leads_active_user_select on public.whatsapp_leads;
revoke all on table public.whatsapp_leads from public, anon, authenticated;
grant all privileges on table public.whatsapp_leads to service_role;

-- 3) Origem dos documentos. Permite que mídia recebida no WhatsApp apareça
-- na Pasta do Cliente sem duplicar o mesmo arquivo em reprocessamentos do webhook.
alter table public.documents
  add column if not exists source text,
  add column if not exists source_external_id text;

create unique index if not exists idx_documents_whatsapp_source_unique
  on public.documents(law_firm_id, source, source_external_id)
  where source = 'whatsapp' and source_external_id is not null;

-- Mídias antigas de conversas já vinculadas a clientes também passam a aparecer
-- na Pasta do Cliente. O mesmo objeto do Storage é reaproveitado, sem cópia física.
insert into public.documents (
  law_firm_id, client_id, title, doc_type, storage_path, source, source_external_id, notes, created_at
)
select
  m.law_firm_id,
  m.client_id,
  coalesce(nullif(m.file_name, ''),
    case lower(coalesce(m.message_type, ''))
      when 'image' then 'Imagem recebida pelo WhatsApp'
      when 'video' then 'Vídeo recebido pelo WhatsApp'
      when 'audio' then 'Áudio recebido pelo WhatsApp'
      when 'sticker' then 'Figurinha recebida pelo WhatsApp'
      else 'Arquivo recebido pelo WhatsApp'
    end),
  'whatsapp',
  m.storage_path,
  'whatsapp',
  coalesce(m.external_id, m.id::text),
  'Recebido automaticamente pelo WhatsApp.',
  coalesce(m.created_at, now())
from public.whatsapp_messages m
where m.direction = 'inbound'
  and m.client_id is not null
  and m.storage_path is not null
  and m.deleted_at is null
on conflict do nothing;

-- 4) Mantém o Realtime das conversas funcionando com os novos campos.
alter table public.whatsapp_conversations replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
