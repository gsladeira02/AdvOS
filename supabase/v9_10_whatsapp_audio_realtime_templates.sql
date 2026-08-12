-- AdvOS V9.10 — áudio no WhatsApp, atualização mais forte e templates oficiais Meta
-- Rode no Supabase SQL Editor depois de subir esta versão.

alter table public.message_templates
  add column if not exists meta_template_name text,
  add column if not exists meta_template_language text not null default 'pt_BR';

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

create index if not exists idx_message_templates_meta_template
on public.message_templates(law_firm_id, meta_template_name)
where meta_template_name is not null;

create index if not exists idx_whatsapp_messages_conversation_not_deleted
on public.whatsapp_messages(law_firm_id, conversation_id, created_at)
where deleted_at is null;

create index if not exists idx_whatsapp_messages_firm_external_id
on public.whatsapp_messages(law_firm_id, external_id)
where external_id is not null;

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
