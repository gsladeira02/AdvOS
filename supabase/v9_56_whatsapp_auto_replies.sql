begin;

create table if not exists public.whatsapp_auto_replies (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'new_lead',
  message text not null,
  keywords text[] not null default '{}',
  department text null,
  active boolean not null default true,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_auto_replies_trigger_check check (trigger_type in ('new_lead','keyword')),
  constraint whatsapp_auto_replies_department_check check (department is null or department in ('atendimento','financeiro_juridico')),
  constraint whatsapp_auto_replies_name_len check (char_length(trim(name)) between 1 and 80),
  constraint whatsapp_auto_replies_message_len check (char_length(trim(message)) between 1 and 4096)
);

create index if not exists whatsapp_auto_replies_firm_active_idx
  on public.whatsapp_auto_replies (law_firm_id, active, sort_order, created_at);

create table if not exists public.whatsapp_auto_reply_logs (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  rule_id uuid not null references public.whatsapp_auto_replies(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  inbound_message_id uuid null references public.whatsapp_messages(id) on delete set null,
  outbound_message_id uuid null references public.whatsapp_messages(id) on delete set null,
  status text not null default 'processing',
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_auto_reply_logs_status_check check (status in ('processing','sent','failed')),
  constraint whatsapp_auto_reply_logs_once unique (rule_id, conversation_id)
);

create index if not exists whatsapp_auto_reply_logs_firm_idx
  on public.whatsapp_auto_reply_logs (law_firm_id, created_at desc);

alter table public.whatsapp_auto_replies enable row level security;
alter table public.whatsapp_auto_reply_logs enable row level security;

revoke all on table public.whatsapp_auto_replies from public, anon, authenticated;
revoke all on table public.whatsapp_auto_reply_logs from public, anon, authenticated;
grant all privileges on table public.whatsapp_auto_replies to service_role;
grant all privileges on table public.whatsapp_auto_reply_logs to service_role;

notify pgrst, 'reload schema';
commit;
