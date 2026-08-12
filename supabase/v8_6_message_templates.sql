-- AdvOS V8.6 - Modelos de mensagem para WhatsApp Web
-- Rode este arquivo uma vez no Supabase SQL Editor.

create table if not exists message_templates (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references law_firms(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null default 'geral',
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(law_firm_id, slug)
);

alter table message_templates enable row level security;
drop policy if exists "message_templates_same_firm_all" on message_templates;
create policy "message_templates_same_firm_all" on message_templates
  for all using (law_firm_id = public.current_law_firm_id())
  with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_message_templates_law_firm_category on message_templates(law_firm_id, category);
create index if not exists idx_message_templates_law_firm_slug on message_templates(law_firm_id, slug);
