-- AdvOS v9.48 — Login normal (sem MFA obrigatório)
-- Remove somente a exigência AAL2 das policies criadas pela v9.39.
-- Mantém RLS, isolamento por usuário/escritório, rate limiting e auditoria.
-- Idempotente: pode ser executado mesmo se a v9.39 não tiver sido aplicada.

begin;

alter table public.profiles enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists profiles_self_active_select on public.profiles;
create policy profiles_self_active_select
on public.profiles
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and status = 'ativo'
);

drop policy if exists whatsapp_conversations_active_user_select on public.whatsapp_conversations;
create policy whatsapp_conversations_active_user_select
on public.whatsapp_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.status = 'ativo'
      and p.law_firm_id = whatsapp_conversations.law_firm_id
  )
);

drop policy if exists whatsapp_messages_active_user_select on public.whatsapp_messages;
create policy whatsapp_messages_active_user_select
on public.whatsapp_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.status = 'ativo'
      and p.law_firm_id = whatsapp_messages.law_firm_id
  )
);

commit;
notify pgrst, 'reload schema';
