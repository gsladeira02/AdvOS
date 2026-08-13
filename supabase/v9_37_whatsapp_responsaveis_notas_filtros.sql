-- AdvOS v9.37 — Responsáveis, notas internas e histórico operacional do WhatsApp
-- Migração aditiva. Pode ser executada antes do deploy da v9.37.

begin;

-- 1) Responsável atual da conversa.
alter table public.whatsapp_conversations
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;

create index if not exists idx_whatsapp_conversations_assigned
  on public.whatsapp_conversations(law_firm_id, assigned_to, last_message_at desc)
  where closed_at is null;

-- 2) Notas internas: nunca são enviadas ao WhatsApp.
create table if not exists public.whatsapp_internal_notes (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(body)) between 1 and 5000)
);

create index if not exists idx_whatsapp_internal_notes_conversation
  on public.whatsapp_internal_notes(law_firm_id, conversation_id, created_at desc);

alter table public.whatsapp_internal_notes enable row level security;
revoke all on table public.whatsapp_internal_notes from public, anon, authenticated;
grant all privileges on table public.whatsapp_internal_notes to service_role;

-- 3) Histórico operacional da conversa.
create table if not exists public.whatsapp_conversation_events (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_conversation_events_conversation
  on public.whatsapp_conversation_events(law_firm_id, conversation_id, created_at desc);

alter table public.whatsapp_conversation_events enable row level security;
revoke all on table public.whatsapp_conversation_events from public, anon, authenticated;
grant all privileges on table public.whatsapp_conversation_events to service_role;

-- 4) O Realtime precisa refletir mudança de responsável na lista.
alter table public.whatsapp_conversations replica identity full;

notify pgrst, 'reload schema';
commit;
