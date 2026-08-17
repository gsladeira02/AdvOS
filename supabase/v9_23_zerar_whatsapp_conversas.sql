-- AdvOS V9.23 — zerar aba Conversas do WhatsApp sem apagar clientes
--
-- Use este SQL se você quer que a aba WhatsApp > Conversas comece limpa,
-- aparecendo somente conversas que receberem/enviarem mensagens a partir de agora.
--
-- Importante: isto NÃO apaga clientes. As mensagens antigas são marcadas como
-- apagadas dentro do AdvOS (soft delete) e deixam de aparecer na central.

alter table public.whatsapp_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_for_all boolean not null default false;

update public.whatsapp_messages
set
  deleted_at = coalesce(deleted_at, now()),
  deleted_for_all = false
where deleted_at is null;

update public.whatsapp_conversations
set
  unread_count = 0,
  last_message_at = null,
  updated_at = now()
where true;

create index if not exists idx_whatsapp_messages_not_deleted
on public.whatsapp_messages(conversation_id, created_at)
where deleted_at is null;

notify pgrst, 'reload schema';
