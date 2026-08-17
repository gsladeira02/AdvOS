-- AdvOS V9.26 — hardening de segurança (single-office)
-- Execute UMA vez no SQL Editor do Supabase depois de publicar o código V9.26.
--
-- Modelo final:
--   • identidade é validada no servidor;
--   • dados jurídicos são lidos/escritos pelo backend com service_role;
--   • o JWT do navegador não recebe acesso direto a clientes/processos/financeiro/documentos;
--   • somente o próprio perfil e as duas tabelas de Realtime do WhatsApp têm SELECT direto;
--   • nenhuma tabela do AdvOS aceita INSERT/UPDATE/DELETE direto de anon/authenticated;
--   • usuários inativos não recebem eventos do WhatsApp via RLS;
--   • documentos permanecem em bucket privado e acesso direto ao bucket é bloqueado.

begin;

-- Se ainda não existir administrador, promove somente o perfil ativo mais antigo.
-- A aplicação V9.26 não faz elevação automática de privilégio em runtime.
do $$
begin
  if not exists (
    select 1
    from public.profiles
    where lower(coalesce(role, '')) in ('admin', 'administrador', 'proprietario', 'proprietário')
      and status = 'ativo'
  ) then
    update public.profiles
       set role = 'administrador'
     where id = (
       select id
       from public.profiles
       where status = 'ativo'
       order by created_at asc
       limit 1
     );
  end if;
end $$;

-- RLS deve permanecer habilitado em todas as tabelas do AdvOS.
alter table public.law_firms enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.clients enable row level security;
alter table public.cases enable row level security;
alter table public.case_parties enable row level security;
alter table public.deadlines enable row level security;
alter table public.calendar_events enable row level security;
alter table public.documents enable row level security;
alter table public.document_signatures enable row level security;
alter table public.financial_contracts enable row level security;
alter table public.financial_installments enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;
alter table public.integration_settings enable row level security;
alter table public.webhook_events enable row level security;
alter table public.asaas_import_batches enable row level security;
alter table public.generated_contracts enable row level security;
alter table public.legal_services enable row level security;
alter table public.message_templates enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Remove as policies antigas, principalmente as políticas FOR ALL que permitiam
-- CRUD direto pelo token do navegador.
drop policy if exists "law_firms_same_firm_select" on public.law_firms;
drop policy if exists "profiles_same_firm_all" on public.profiles;
drop policy if exists "profiles_same_firm_select" on public.profiles;
drop policy if exists "subscriptions_same_firm_select" on public.subscriptions;
drop policy if exists "clients_same_firm_all" on public.clients;
drop policy if exists "clients_same_firm_select" on public.clients;
drop policy if exists "cases_same_firm_all" on public.cases;
drop policy if exists "cases_same_firm_select" on public.cases;
drop policy if exists "case_parties_same_firm_all" on public.case_parties;
drop policy if exists "case_parties_same_firm_select" on public.case_parties;
drop policy if exists "deadlines_same_firm_all" on public.deadlines;
drop policy if exists "deadlines_same_firm_select" on public.deadlines;
drop policy if exists "calendar_events_same_firm_all" on public.calendar_events;
drop policy if exists "calendar_events_same_firm_select" on public.calendar_events;
drop policy if exists "documents_same_firm_all" on public.documents;
drop policy if exists "documents_same_firm_select" on public.documents;
drop policy if exists "document_signatures_same_firm_all" on public.document_signatures;
drop policy if exists "document_signatures_same_firm_select" on public.document_signatures;
drop policy if exists "financial_contracts_same_firm_all" on public.financial_contracts;
drop policy if exists "financial_contracts_same_firm_select" on public.financial_contracts;
drop policy if exists "financial_installments_same_firm_all" on public.financial_installments;
drop policy if exists "financial_installments_same_firm_select" on public.financial_installments;
drop policy if exists "tasks_same_firm_all" on public.tasks;
drop policy if exists "tasks_same_firm_select" on public.tasks;
drop policy if exists "activity_logs_same_firm_all" on public.activity_logs;
drop policy if exists "generated_contracts_same_firm_all" on public.generated_contracts;
drop policy if exists "generated_contracts_same_firm_select" on public.generated_contracts;
drop policy if exists "legal_services_same_firm_all" on public.legal_services;
drop policy if exists "legal_services_same_firm_select" on public.legal_services;
drop policy if exists "message_templates_same_firm_all" on public.message_templates;
drop policy if exists "message_templates_same_firm_select" on public.message_templates;
drop policy if exists "whatsapp_conversations_same_firm_all" on public.whatsapp_conversations;
drop policy if exists "whatsapp_conversations_same_firm_select" on public.whatsapp_conversations;
drop policy if exists "whatsapp_messages_same_firm_all" on public.whatsapp_messages;
drop policy if exists "whatsapp_messages_same_firm_select" on public.whatsapp_messages;
drop policy if exists "webhook_events_same_firm_all" on public.webhook_events;
drop policy if exists "asaas_import_batches_same_firm_all" on public.asaas_import_batches;

-- Policies da própria V9.26 também são removidas para tornar a migração idempotente.
drop policy if exists "profiles_self_active_select" on public.profiles;
drop policy if exists "whatsapp_conversations_active_user_select" on public.whatsapp_conversations;
drop policy if exists "whatsapp_messages_active_user_select" on public.whatsapp_messages;

-- O navegador pode consultar somente o próprio perfil ativo.
-- Não há SECURITY DEFINER aqui, eliminando o helper público antigo.
create policy profiles_self_active_select
on public.profiles
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and status = 'ativo'
);

-- Realtime do WhatsApp precisa de SELECT direto. O vínculo do escritório é obtido
-- a partir do próprio perfil ativo do usuário, cuja policy acima não é recursiva.
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

-- Menor privilégio no Data API: nada para anon; authenticated só recebe os três SELECTs
-- necessários (perfil próprio + Realtime do WhatsApp).
revoke all on table public.law_firms from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;
revoke all on table public.clients from public, anon, authenticated;
revoke all on table public.cases from public, anon, authenticated;
revoke all on table public.case_parties from public, anon, authenticated;
revoke all on table public.deadlines from public, anon, authenticated;
revoke all on table public.calendar_events from public, anon, authenticated;
revoke all on table public.documents from public, anon, authenticated;
revoke all on table public.document_signatures from public, anon, authenticated;
revoke all on table public.financial_contracts from public, anon, authenticated;
revoke all on table public.financial_installments from public, anon, authenticated;
revoke all on table public.tasks from public, anon, authenticated;
revoke all on table public.activity_logs from public, anon, authenticated;
revoke all on table public.integration_settings from public, anon, authenticated;
revoke all on table public.webhook_events from public, anon, authenticated;
revoke all on table public.asaas_import_batches from public, anon, authenticated;
revoke all on table public.generated_contracts from public, anon, authenticated;
revoke all on table public.legal_services from public, anon, authenticated;
revoke all on table public.message_templates from public, anon, authenticated;
revoke all on table public.whatsapp_conversations from public, anon, authenticated;
revoke all on table public.whatsapp_messages from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.whatsapp_conversations to authenticated;
grant select on table public.whatsapp_messages to authenticated;

-- Sequências também não precisam ficar acessíveis ao navegador.
revoke all privileges on all sequences in schema public from public, anon, authenticated;
grant all privileges on all sequences in schema public to service_role;

-- Nenhuma função pública deve ficar RPC-executável pelo navegador por herança de PUBLIC.
-- A aplicação V9.26 não usa RPC no schema public.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Mantém o mesmo princípio de menor privilégio para objetos criados por migrações futuras
-- executadas pelo papel postgres. Caso uma nova tabela/função precise ser exposta ao
-- navegador, a permissão deverá ser concedida explicitamente na própria migração.
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- O backend usa a chave secreta/service_role e precisa de acesso completo às tabelas.
grant all privileges on table public.law_firms to service_role;
grant all privileges on table public.profiles to service_role;
grant all privileges on table public.subscriptions to service_role;
grant all privileges on table public.clients to service_role;
grant all privileges on table public.cases to service_role;
grant all privileges on table public.case_parties to service_role;
grant all privileges on table public.deadlines to service_role;
grant all privileges on table public.calendar_events to service_role;
grant all privileges on table public.documents to service_role;
grant all privileges on table public.document_signatures to service_role;
grant all privileges on table public.financial_contracts to service_role;
grant all privileges on table public.financial_installments to service_role;
grant all privileges on table public.tasks to service_role;
grant all privileges on table public.activity_logs to service_role;
grant all privileges on table public.integration_settings to service_role;
grant all privileges on table public.webhook_events to service_role;
grant all privileges on table public.asaas_import_batches to service_role;
grant all privileges on table public.generated_contracts to service_role;
grant all privileges on table public.legal_services to service_role;
grant all privileges on table public.message_templates to service_role;
grant all privileges on table public.whatsapp_conversations to service_role;
grant all privileges on table public.whatsapp_messages to service_role;

-- Links assinados antigos do WhatsApp não precisam ficar persistidos no banco.
-- Quando existe storage_path, a V9.26 serve a mídia por endpoint autenticado e gera
-- um link temporário apenas no momento da leitura.
update public.whatsapp_messages
set media_url = null,
    raw_payload = case
      when raw_payload is null then null
      else raw_payload - 'advos_media_url'
    end
where storage_path is not null
  and (media_url is not null or coalesce(raw_payload, '{}'::jsonb) ? 'advos_media_url');

-- Storage jurídico: bucket sempre privado e acesso direto pelo JWT bloqueado,
-- inclusive se uma policy permissiva for criada acidentalmente no futuro.
update storage.buckets
set public = false
where id = 'documents';

drop policy if exists "advos_documents_no_direct_access" on storage.objects;
create policy "advos_documents_no_direct_access"
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'documents')
with check (bucket_id <> 'documents');

-- A função de trigger não precisa ficar executável pelos papéis do navegador.
alter function public.set_updated_at() set search_path = '';
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

-- A função antiga era SECURITY DEFINER e ficava exposta no schema public.
-- Todas as policies dependentes foram removidas acima; ela não é mais necessária.
drop function if exists public.current_law_firm_id();

commit;

notify pgrst, 'reload schema';
