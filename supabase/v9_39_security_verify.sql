-- AdvOS v9.39 — verificação pós-hardening. Somente leitura.

-- 1) Tabelas do schema public sem RLS (esperado: nenhuma tabela de negócio do AdvOS).
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename not like 'pg_%'
  and rowsecurity = false
order by tablename;

-- 2) Grants diretos para anon/authenticated. Esperado:
-- authenticated = SELECT somente em profiles, whatsapp_conversations e whatsapp_messages.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
order by grantee, table_name, privilege_type;

-- 3) Funções executáveis por anon/authenticated. Esperado: nenhuma.
select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('anon','authenticated')
order by routine_name, grantee;

-- 4) Policies do trio exposto ao navegador: devem conter AAL2.
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','whatsapp_conversations','whatsapp_messages')
order by tablename, policyname;

-- 5) Bucket documents deve ser privado.
select id, name, public
from storage.buckets
where id = 'documents';

-- 6) Policy restritiva do Storage deve existir.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'advos_documents_no_direct_access';

-- 7) Objetos de segurança da v9.39.
select to_regclass('public.security_events') as security_events,
       to_regclass('public.security_rate_limits') as security_rate_limits,
       to_regprocedure('public.advos_consume_rate_limit(text,integer,integer)') as rate_limit_function;
