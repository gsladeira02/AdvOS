-- AdvOS V9.2 - WhatsApp Cloud API oficial
-- Rode este arquivo no Supabase SQL Editor antes do deploy ou logo após atualizar o código.

alter table public.integration_settings
  add column if not exists raw_settings jsonb default '{}'::jsonb;

create table if not exists public.whatsapp_conversations (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  phone text not null,
  lead_name text,
  status text not null default 'aberta',
  unread_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(law_firm_id, phone, client_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  direction text not null,
  message_type text not null default 'text',
  body text,
  external_id text unique,
  status text not null default 'pending',
  sent_by uuid references auth.users(id) on delete set null,
  raw_payload jsonb,
  delivered_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_conversations_same_firm_all on public.whatsapp_conversations;
drop policy if exists whatsapp_messages_same_firm_all on public.whatsapp_messages;

create policy whatsapp_conversations_same_firm_all
on public.whatsapp_conversations
for all
using (law_firm_id = public.current_law_firm_id())
with check (law_firm_id = public.current_law_firm_id());

create policy whatsapp_messages_same_firm_all
on public.whatsapp_messages
for all
using (law_firm_id = public.current_law_firm_id())
with check (law_firm_id = public.current_law_firm_id());

create index if not exists idx_whatsapp_conversations_firm_last
on public.whatsapp_conversations(law_firm_id, last_message_at desc);

create index if not exists idx_whatsapp_conversations_phone
on public.whatsapp_conversations(law_firm_id, phone);

create index if not exists idx_whatsapp_messages_conversation_created
on public.whatsapp_messages(conversation_id, created_at);

create index if not exists idx_whatsapp_messages_external_id
on public.whatsapp_messages(external_id);

grant all on table public.whatsapp_conversations to authenticated;
grant all on table public.whatsapp_messages to authenticated;
grant all on table public.whatsapp_conversations to service_role;
grant all on table public.whatsapp_messages to service_role;

notify pgrst, 'reload schema';
