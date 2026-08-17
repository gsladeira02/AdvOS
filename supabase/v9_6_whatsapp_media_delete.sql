-- AdvOS V9.6 — WhatsApp parecido com app real: anexos, apagar mensagens e metadados de mídia

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

alter table public.whatsapp_messages
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists media_url text,
  add column if not exists storage_path text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_for_all boolean not null default false;

create index if not exists idx_whatsapp_messages_not_deleted
on public.whatsapp_messages(conversation_id, created_at)
where deleted_at is null;

alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_messages replica identity full;

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
