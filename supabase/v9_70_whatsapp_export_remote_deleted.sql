-- AdvOS v9.70
alter table if exists public.whatsapp_messages
  add column if not exists remote_deleted_at timestamptz,
  add column if not exists remote_deleted_by text,
  add column if not exists remote_delete_source text;

create index if not exists idx_whatsapp_messages_remote_deleted
  on public.whatsapp_messages(law_firm_id, conversation_id, remote_deleted_at)
  where remote_deleted_at is not null;
