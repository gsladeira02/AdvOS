-- AdvOS v9.73 — Security Hardening / Supabase Lint Cleanup
-- Execute UMA vez no SQL Editor do Supabase depois de publicar a v9.73.
--
-- Objetivos:
--   1) Fechar RPCs SECURITY DEFINER para anon/authenticated.
--   2) Evitar que novas funções públicas herdem EXECUTE para PUBLIC.
--   3) Garantir RLS nas tabelas do AdvOS e menor privilégio no Data API.
--   4) Manter apenas os SELECTs do perfil próprio e do Realtime do WhatsApp.
--   5) Endurecer o search_path das SECURITY DEFINER.
--
-- A proteção de senhas vazadas do Supabase Auth NÃO é habilitada por SQL desta migration;
-- ela deve ser ativada no Dashboard do Supabase em Authentication -> Password Security.

begin;

-- Não permitir criação de objetos no schema public por usuários da API.
revoke create on schema public from public, anon, authenticated;

-- Fechar explicitamente as funções SECURITY DEFINER identificadas pelo linter.
-- Elas continuam funcionando para triggers porque o PostgreSQL executa o trigger
-- pelo contexto da função; apenas a execução via RPC pelo navegador é bloqueada.
revoke execute on function public.advos_contract_marks_lead_won() from public, anon, authenticated;
revoke execute on function public.advos_find_client_lead(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.advos_installment_marks_first_payment() from public, anon, authenticated;
revoke execute on function public.advos_link_contract_to_lead() from public, anon, authenticated;
revoke execute on function public.advos_whatsapp_lead_stage_after() from public, anon, authenticated;
revoke execute on function public.advos_whatsapp_lead_stage_before() from public, anon, authenticated;

-- Endurece o search_path das funções acima.
alter function public.advos_contract_marks_lead_won() set search_path = public, pg_temp;
alter function public.advos_find_client_lead(uuid, uuid) set search_path = public, pg_temp;
alter function public.advos_installment_marks_first_payment() set search_path = public, pg_temp;
alter function public.advos_link_contract_to_lead() set search_path = public, pg_temp;
alter function public.advos_whatsapp_lead_stage_after() set search_path = public, pg_temp;
alter function public.advos_whatsapp_lead_stage_before() set search_path = public, pg_temp;

-- Mantém o padrão de menor privilégio para funções existentes.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Proteção futura: funções criadas pelo papel que executa a migration não devem nascer públicas.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  grant execute on functions to service_role;

-- RLS em todas as tabelas atuais do schema public.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('alter table %s enable row level security', r.table_name);
  end loop;
end $$;

-- Menor privilégio: o navegador não escreve diretamente no Data API.
do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', r.table_name);
    execute format('grant all privileges on table public.%I to service_role', r.table_name);
  end loop;
end $$;

-- As únicas tabelas lidas diretamente pelo navegador são o próprio perfil e o Realtime.
grant select on table public.profiles to authenticated;
grant select on table public.whatsapp_conversations to authenticated;
grant select on table public.whatsapp_messages to authenticated;

-- Reaplica as policies fundamentais do Realtime e do próprio perfil, sem helpers públicos.
drop policy if exists profiles_self_active_select on public.profiles;
create policy profiles_self_active_select
on public.profiles
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and status = 'ativo'
  and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
);

drop policy if exists whatsapp_conversations_active_user_select on public.whatsapp_conversations;
create policy whatsapp_conversations_active_user_select
on public.whatsapp_conversations
for select
to authenticated
using (
  coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  and exists (
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
  coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  and exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.status = 'ativo'
      and p.law_firm_id = whatsapp_messages.law_firm_id
  )
);

-- Storage jurídico permanece privado.
update storage.buckets set public = false where id = 'documents';
drop policy if exists "advos_documents_no_direct_access" on storage.objects;
create policy "advos_documents_no_direct_access"
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'documents')
with check (bucket_id <> 'documents');

commit;

notify pgrst, 'reload schema';
