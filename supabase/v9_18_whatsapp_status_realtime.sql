-- V9.18 - WhatsApp: atualização em tempo real dos vistos/status

alter table public.whatsapp_messages
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists error_message text;

alter table public.whatsapp_conversations
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_whatsapp_messages_firm_external_id
on public.whatsapp_messages(law_firm_id, external_id)
where external_id is not null;

create index if not exists idx_whatsapp_messages_conversation_updated
on public.whatsapp_messages(law_firm_id, conversation_id, updated_at desc);

alter table public.whatsapp_messages replica identity full;
alter table public.whatsapp_conversations replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.whatsapp_messages;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.whatsapp_conversations;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
