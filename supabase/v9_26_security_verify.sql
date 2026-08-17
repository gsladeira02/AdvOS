-- AdvOS V9.26 — verificação pós-hardening (somente leitura)

-- 1) Policies efetivas nas tabelas públicas do AdvOS.
select schemaname, tablename, policyname, roles, cmd, permissive
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 2) Grants ainda disponíveis a anon/authenticated.
-- Esperado: authenticated com SELECT apenas em profiles, whatsapp_conversations e whatsapp_messages.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;

-- 3) Funções públicas executáveis por anon/authenticated.
-- Esperado para a V9.26: nenhuma função do AdvOS exposta por RPC.
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by routine_name, grantee;

-- 4) Helper SECURITY DEFINER antigo deve ter sido removido.
select to_regprocedure('public.current_law_firm_id()') as current_law_firm_id_deve_ser_null;

-- 5) Bucket jurídico deve permanecer privado.
select id, name, public
from storage.buckets
where id = 'documents';

-- 6) Policies do Storage relacionadas ao bucket.
select schemaname, tablename, policyname, roles, cmd, permissive
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 7) Confirma se existe ao menos um administrador ativo.
select id, full_name, email, role, status
from public.profiles
where lower(coalesce(role, '')) in ('admin', 'administrador', 'proprietario', 'proprietário')
  and status = 'ativo'
order by created_at;
