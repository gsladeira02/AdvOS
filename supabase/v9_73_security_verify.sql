-- AdvOS v9.73 — verificação pós-hardening
-- Deve retornar zero linhas nas duas primeiras consultas.

-- 1) Nenhuma das funções identificadas pelo linter deve ser executável por anon/authenticated.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'advos_contract_marks_lead_won',
    'advos_find_client_lead',
    'advos_installment_marks_first_payment',
    'advos_link_contract_to_lead',
    'advos_whatsapp_lead_stage_after',
    'advos_whatsapp_lead_stage_before'
  )
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );

-- 2) Nenhuma dessas funções deve ter SECURITY DEFINER.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'advos_contract_marks_lead_won',
    'advos_find_client_lead',
    'advos_installment_marks_first_payment',
    'advos_link_contract_to_lead',
    'advos_whatsapp_lead_stage_after',
    'advos_whatsapp_lead_stage_before'
  )
  and p.prosecdef = true;

-- 3) Confirma RLS e grants das três tabelas lidas diretamente pelo navegador.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','whatsapp_conversations','whatsapp_messages')
order by tablename;

-- 4) Proteção de senha vazada é checada no Dashboard do Supabase:
-- Authentication -> Password Security -> Leaked password protection = Enabled.
