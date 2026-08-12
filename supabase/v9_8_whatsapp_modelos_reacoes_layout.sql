-- AdvOS V9.8 — correções de modelos, WhatsApp em tempo real visual, reações e melhorias de layout
-- Rode este arquivo no Supabase SQL Editor antes do redeploy, ou logo depois.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_templates
  add column if not exists shortcut text,
  add column if not exists category text default 'geral',
  add column if not exists active boolean not null default true,
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

create index if not exists idx_message_templates_law_firm_category on public.message_templates(law_firm_id, category);
create index if not exists idx_message_templates_law_firm_slug on public.message_templates(law_firm_id, slug);
create index if not exists idx_message_templates_law_firm_shortcut on public.message_templates(law_firm_id, shortcut);

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
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_whatsapp_messages_not_deleted
on public.whatsapp_messages(conversation_id, created_at)
where deleted_at is null;

create index if not exists idx_whatsapp_messages_external_id
on public.whatsapp_messages(law_firm_id, external_id);

alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_messages replica identity full;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.whatsapp_conversations;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.whatsapp_messages;
  exception when duplicate_object then
    null;
  end;
end $$;

notify pgrst, 'reload schema';
