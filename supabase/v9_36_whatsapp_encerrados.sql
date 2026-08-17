-- AdvOS v9.36 — Aba Encerrados no WhatsApp
-- Migração aditiva. Pode ser executada antes do deploy da v9.36.

begin;

alter table public.whatsapp_conversations
  add column if not exists closed_at timestamptz,
  add column if not exists closed_from_department text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_closed_from_department_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_closed_from_department_check
  check (closed_from_department is null or closed_from_department in ('atendimento', 'financeiro_juridico'));

create index if not exists idx_whatsapp_conversations_closed
  on public.whatsapp_conversations(law_firm_id, closed_at desc)
  where closed_at is not null;

create index if not exists idx_whatsapp_conversations_active_department
  on public.whatsapp_conversations(law_firm_id, department, last_message_at desc)
  where closed_at is null;

alter table public.whatsapp_conversations replica identity full;

notify pgrst, 'reload schema';
commit;
