-- AdvOS V9.9 — correção de conversas, mídia recebida e contatos pesquisáveis
-- Rode no Supabase se você ainda não rodou as migrations V9.6/V9.8, ou para garantir as colunas de mídia.

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

create index if not exists idx_whatsapp_messages_conversation_not_deleted
on public.whatsapp_messages(law_firm_id, conversation_id, created_at)
where deleted_at is null;

create index if not exists idx_whatsapp_conversations_firm_phone
on public.whatsapp_conversations(law_firm_id, phone);

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
