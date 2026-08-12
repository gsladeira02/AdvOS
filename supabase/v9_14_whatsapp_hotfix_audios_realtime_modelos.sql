-- AdvOS V9.14 — hotfix WhatsApp: modelos, mensagens, mídia, áudio e realtime
-- Rode no Supabase SQL Editor antes/depois do deploy para garantir que todas as colunas existem.

create extension if not exists pgcrypto;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  name text not null,
  slug text not null,
  shortcut text,
  category text not null default 'geral',
  body text not null,
  active boolean not null default true,
  meta_template_name text,
  meta_template_language text not null default 'pt_BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_templates
  add column if not exists shortcut text,
  add column if not exists category text not null default 'geral',
  add column if not exists active boolean not null default true,
  add column if not exists meta_template_name text,
  add column if not exists meta_template_language text not null default 'pt_BR',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.message_templates
set shortcut = '/' || regexp_replace(
  lower(coalesce(nullif(slug, ''), nullif(name, ''), 'modelo')),
  '[^a-z0-9_]+',
  '_',
  'g'
)
where shortcut is null or trim(shortcut) = '';

alter table public.message_templates enable row level security;
drop policy if exists message_templates_same_firm_all on public.message_templates;
drop policy if exists "message_templates_same_firm_all" on public.message_templates;
create policy message_templates_same_firm_all
on public.message_templates
for all
using (law_firm_id = public.current_law_firm_id())
with check (law_firm_id = public.current_law_firm_id());

grant all on table public.message_templates to authenticated;
grant all on table public.message_templates to service_role;

alter table public.whatsapp_messages
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists media_url text,
  add column if not exists storage_path text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_for_all boolean not null default false,
  add column if not exists reaction_emoji text,
  add column if not exists reacted_at timestamptz,
  add column if not exists reaction_by uuid references auth.users(id) on delete set null,
  add column if not exists client_reaction_emoji text,
  add column if not exists client_reacted_at timestamptz,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_message_templates_law_firm_category on public.message_templates(law_firm_id, category);
create index if not exists idx_message_templates_law_firm_slug on public.message_templates(law_firm_id, slug);
create index if not exists idx_message_templates_law_firm_shortcut on public.message_templates(law_firm_id, shortcut);
create index if not exists idx_message_templates_meta_template on public.message_templates(law_firm_id, meta_template_name) where meta_template_name is not null;
create index if not exists idx_whatsapp_conversations_firm_phone on public.whatsapp_conversations(law_firm_id, phone);
create index if not exists idx_whatsapp_messages_conversation_not_deleted on public.whatsapp_messages(law_firm_id, conversation_id, created_at) where deleted_at is null;
create index if not exists idx_whatsapp_messages_firm_external_id on public.whatsapp_messages(law_firm_id, external_id) where external_id is not null;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.whatsapp_conversations;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.whatsapp_messages;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
