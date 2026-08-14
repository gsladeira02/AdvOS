-- AdvOS v9.53 — Idempotência e proteção contra duplicações do Asaas
-- Execute uma vez no SQL Editor do Supabase após publicar a v9.53.
-- A limpeza abaixo afeta somente cobranças Asaas com identificador forte repetido.

begin;

create temporary table if not exists _advos_v953_orphan_candidates (
  contract_id uuid primary key
) on commit drop;

-- 1) Marca e remove repetições pelo ID externo do Asaas, mantendo a versão mais recente.
with ranked as (
  select id, contract_id,
         row_number() over (
           partition by law_firm_id, provider, external_id
           order by coalesce(updated_at, created_at) desc, created_at desc, id desc
         ) as rn
  from public.financial_installments
  where provider = 'asaas'
    and external_id is not null
    and btrim(external_id) <> ''
)
insert into _advos_v953_orphan_candidates(contract_id)
select distinct contract_id from ranked where rn > 1 and contract_id is not null
on conflict do nothing;

with ranked as (
  select id,
         row_number() over (
           partition by law_firm_id, provider, external_id
           order by coalesce(updated_at, created_at) desc, created_at desc, id desc
         ) as rn
  from public.financial_installments
  where provider = 'asaas'
    and external_id is not null
    and btrim(external_id) <> ''
)
delete from public.financial_installments f
using ranked r
where f.id = r.id and r.rn > 1;

-- 2) Marca e remove repetições pela chave determinística de importação.
with ranked as (
  select id, contract_id,
         row_number() over (
           partition by law_firm_id, provider, import_key
           order by coalesce(updated_at, created_at) desc, created_at desc, id desc
         ) as rn
  from public.financial_installments
  where provider = 'asaas'
    and import_key is not null
    and btrim(import_key) <> ''
)
insert into _advos_v953_orphan_candidates(contract_id)
select distinct contract_id from ranked where rn > 1 and contract_id is not null
on conflict do nothing;

with ranked as (
  select id,
         row_number() over (
           partition by law_firm_id, provider, import_key
           order by coalesce(updated_at, created_at) desc, created_at desc, id desc
         ) as rn
  from public.financial_installments
  where provider = 'asaas'
    and import_key is not null
    and btrim(import_key) <> ''
)
delete from public.financial_installments f
using ranked r
where f.id = r.id and r.rn > 1;

-- Remove somente contratos que pertenciam às parcelas excluídas e ficaram vazios.
delete from public.financial_contracts c
where c.id in (select contract_id from _advos_v953_orphan_candidates)
  and not exists (
    select 1 from public.financial_installments i where i.contract_id = c.id
  );

-- 3) O banco passa a rejeitar duplicações futuras mesmo em importações concorrentes.
create unique index if not exists uq_financial_installments_asaas_external
  on public.financial_installments(law_firm_id, external_id)
  where provider = 'asaas' and external_id is not null and btrim(external_id) <> '';

create unique index if not exists uq_financial_installments_asaas_import_key
  on public.financial_installments(law_firm_id, import_key)
  where provider = 'asaas' and import_key is not null and btrim(import_key) <> '';

commit;
