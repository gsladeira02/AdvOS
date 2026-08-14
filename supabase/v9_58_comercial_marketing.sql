-- AdvOS v9.58 — Comercial + Marketing
-- Funil comercial com histórico, motivos de perda, vínculo de receita e custos de mídia.
-- Execute uma vez no SQL Editor do Supabase antes do deploy da v9.58.

begin;

-- 1) Marcos comerciais persistidos no lead.
alter table public.whatsapp_leads
  add column if not exists stage_changed_at timestamptz not null default now(),
  add column if not exists qualified_at timestamptz,
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists contracted_at timestamptz,
  add column if not exists first_payment_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists loss_reason text,
  add column if not exists loss_notes text;

-- Para dados anteriores à migration, a última atualização é a melhor aproximação
-- disponível para a entrada na etapa atual.
update public.whatsapp_leads
set stage_changed_at = coalesce(updated_at, created_at, now());

create index if not exists idx_whatsapp_leads_commercial_milestones
  on public.whatsapp_leads(law_firm_id, contracted_at, proposal_sent_at, qualified_at);
create index if not exists idx_whatsapp_leads_loss_reason
  on public.whatsapp_leads(law_firm_id, loss_reason)
  where loss_reason is not null;

-- Etapas comerciais padrão. Não remove etapas customizadas do escritório.
insert into public.whatsapp_lead_stages (law_firm_id, stage_key, name, color, sort_order, active, outcome)
select id, 'contratado', 'Contratado', 'green', 80, true, 'won'
from public.law_firms
on conflict (law_firm_id, stage_key) do update
set name = excluded.name,
    color = excluded.color,
    sort_order = excluded.sort_order,
    active = true,
    outcome = 'won',
    updated_at = now();

update public.whatsapp_lead_stages
set name = 'Proposta enviada', updated_at = now()
where stage_key = 'proposta' and name in ('Proposta', 'proposta');

-- 2) Histórico de permanência em cada etapa do funil.
create table if not exists public.whatsapp_lead_stage_history (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  lead_id uuid not null references public.whatsapp_leads(id) on delete cascade,
  stage_key text not null,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  loss_reason text,
  loss_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_lead_stage_history_lead
  on public.whatsapp_lead_stage_history(law_firm_id, lead_id, entered_at desc);
create index if not exists idx_whatsapp_lead_stage_history_stage
  on public.whatsapp_lead_stage_history(law_firm_id, stage_key, entered_at desc);
create unique index if not exists uq_whatsapp_lead_stage_history_open
  on public.whatsapp_lead_stage_history(lead_id)
  where exited_at is null;

alter table public.whatsapp_lead_stage_history enable row level security;
revoke all on table public.whatsapp_lead_stage_history from public, anon, authenticated;
grant all privileges on table public.whatsapp_lead_stage_history to service_role;

-- Backfill dos marcos que podem ser inferidos com segurança do estado atual.
update public.whatsapp_leads l
set qualified_at = coalesce(l.qualified_at, l.created_at)
where l.qualified_at is null
  and (l.qualified_automatically = true or l.stage in ('qualificado','proposta','contratado','convertido'));

update public.whatsapp_leads
set proposal_sent_at = coalesce(proposal_sent_at, updated_at, created_at)
where proposal_sent_at is null and stage = 'proposta';

update public.whatsapp_leads
set contracted_at = coalesce(contracted_at, converted_at, updated_at, created_at)
where contracted_at is null and stage in ('contratado','convertido');

update public.whatsapp_leads
set lost_at = coalesce(lost_at, updated_at, created_at)
where lost_at is null and stage = 'perdido';

insert into public.whatsapp_lead_stage_history (law_firm_id, lead_id, stage_key, entered_at, loss_reason, loss_notes)
select l.law_firm_id, l.id, l.stage, coalesce(l.stage_changed_at, l.updated_at, l.created_at, now()), l.loss_reason, l.loss_notes
from public.whatsapp_leads l
where not exists (
  select 1 from public.whatsapp_lead_stage_history h
  where h.lead_id = l.id and h.exited_at is null
);

create or replace function public.advos_whatsapp_lead_stage_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_outcome text;
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
  elsif new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    select outcome into next_outcome
    from public.whatsapp_lead_stages
    where law_firm_id = new.law_firm_id and stage_key = new.stage
    limit 1;

    if new.stage = 'qualificado' and new.qualified_at is null then
      new.qualified_at := now();
    end if;
    if new.stage = 'proposta' and new.proposal_sent_at is null then
      new.proposal_sent_at := now();
    end if;
    if coalesce(next_outcome, 'open') = 'won' and new.contracted_at is null then
      new.contracted_at := now();
    end if;
    if coalesce(next_outcome, 'open') = 'lost' then
      new.lost_at := coalesce(new.lost_at, now());
    elsif tg_op = 'UPDATE' and old.stage is distinct from new.stage then
      -- loss_reason/loss_notes representam o motivo da perda atual. O histórico
      -- preserva a ocorrência anterior ao recuperar o lead.
      new.lost_at := null;
      new.loss_reason := null;
      new.loss_notes := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.advos_whatsapp_lead_stage_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.whatsapp_lead_stage_history (
      law_firm_id, lead_id, stage_key, entered_at, loss_reason, loss_notes
    ) values (
      new.law_firm_id, new.id, new.stage, coalesce(new.stage_changed_at, new.created_at, now()), new.loss_reason, new.loss_notes
    ) on conflict do nothing;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    update public.whatsapp_lead_stage_history
    set exited_at = coalesce(exited_at, now()),
        loss_reason = case when loss_reason is null then old.loss_reason else loss_reason end,
        loss_notes = case when loss_notes is null then old.loss_notes else loss_notes end
    where lead_id = old.id and exited_at is null;

    insert into public.whatsapp_lead_stage_history (
      law_firm_id, lead_id, stage_key, entered_at, loss_reason, loss_notes
    ) values (
      new.law_firm_id, new.id, new.stage, coalesce(new.stage_changed_at, now()), new.loss_reason, new.loss_notes
    );
  elsif new.loss_reason is distinct from old.loss_reason or new.loss_notes is distinct from old.loss_notes then
    update public.whatsapp_lead_stage_history
    set loss_reason = new.loss_reason, loss_notes = new.loss_notes
    where lead_id = new.id and exited_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_advos_whatsapp_lead_stage_before on public.whatsapp_leads;
create trigger trg_advos_whatsapp_lead_stage_before
before insert or update of stage on public.whatsapp_leads
for each row execute function public.advos_whatsapp_lead_stage_before();

drop trigger if exists trg_advos_whatsapp_lead_stage_after on public.whatsapp_leads;
create trigger trg_advos_whatsapp_lead_stage_after
after insert or update of stage, loss_reason, loss_notes on public.whatsapp_leads
for each row execute function public.advos_whatsapp_lead_stage_after();

-- 3) Vínculo entre o lead de aquisição e contratos/receita.
alter table public.financial_contracts
  add column if not exists lead_id uuid references public.whatsapp_leads(id) on delete set null;
alter table public.generated_contracts
  add column if not exists lead_id uuid references public.whatsapp_leads(id) on delete set null;

create index if not exists idx_financial_contracts_lead_id on public.financial_contracts(lead_id);
create index if not exists idx_generated_contracts_lead_id on public.generated_contracts(lead_id);

create or replace function public.advos_find_client_lead(p_law_firm_id uuid, p_client_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.whatsapp_leads l
  where l.law_firm_id = p_law_firm_id
    and l.converted_client_id = p_client_id
  order by coalesce(l.converted_at, l.updated_at, l.created_at) desc
  limit 1;
$$;

create or replace function public.advos_link_contract_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null and new.client_id is not null then
    new.lead_id := public.advos_find_client_lead(new.law_firm_id, new.client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_advos_financial_contract_lead on public.financial_contracts;
create trigger trg_advos_financial_contract_lead
before insert or update of client_id, lead_id on public.financial_contracts
for each row execute function public.advos_link_contract_to_lead();

drop trigger if exists trg_advos_generated_contract_lead on public.generated_contracts;
create trigger trg_advos_generated_contract_lead
before insert or update of client_id, lead_id on public.generated_contracts
for each row execute function public.advos_link_contract_to_lead();

-- Backfill dos vínculos existentes.
update public.financial_contracts c
set lead_id = public.advos_find_client_lead(c.law_firm_id, c.client_id)
where c.lead_id is null and c.client_id is not null;

update public.generated_contracts c
set lead_id = public.advos_find_client_lead(c.law_firm_id, c.client_id)
where c.lead_id is null and c.client_id is not null;

create or replace function public.advos_contract_marks_lead_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is not null and coalesce(lower(new.status), 'ativo') not in ('cancelado','cancelada','inativo','inativa') then
    update public.whatsapp_leads l
    set stage = case
          when exists (
            select 1 from public.whatsapp_lead_stages s
            where s.law_firm_id = l.law_firm_id and s.stage_key = 'contratado' and s.active = true
          ) then 'contratado'
          else l.stage
        end,
        contracted_at = coalesce(l.contracted_at, new.created_at, now()),
        updated_at = now()
    where l.id = new.lead_id
      and l.law_firm_id = new.law_firm_id
      and not exists (
        select 1 from public.whatsapp_lead_stages s
        where s.law_firm_id = l.law_firm_id and s.stage_key = l.stage and s.outcome = 'lost'
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_advos_contract_marks_lead_won on public.financial_contracts;
create trigger trg_advos_contract_marks_lead_won
after insert or update of lead_id, status on public.financial_contracts
for each row execute function public.advos_contract_marks_lead_won();

-- Contratos já existentes também fecham o ciclo comercial, exceto leads que
-- estejam explicitamente perdidos.
update public.whatsapp_leads l
set stage = 'contratado',
    contracted_at = coalesce(l.contracted_at, x.first_contract_at),
    updated_at = now()
from (
  select lead_id, min(created_at) as first_contract_at
  from public.financial_contracts
  where lead_id is not null and coalesce(lower(status), 'ativo') not in ('cancelado','cancelada','inativo','inativa')
  group by lead_id
) x
where l.id = x.lead_id
  and exists (
    select 1 from public.whatsapp_lead_stages s
    where s.law_firm_id = l.law_firm_id and s.stage_key = 'contratado' and s.active = true
  )
  and not exists (
    select 1 from public.whatsapp_lead_stages s
    where s.law_firm_id = l.law_firm_id and s.stage_key = l.stage and s.outcome = 'lost'
  );

create or replace function public.advos_installment_marks_first_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_lead uuid;
  payment_time timestamptz;
begin
  if lower(coalesce(new.status, '')) = 'pago' then
    select c.lead_id into linked_lead
    from public.financial_contracts c
    where c.id = new.contract_id and c.law_firm_id = new.law_firm_id
    limit 1;

    if linked_lead is not null then
      payment_time := coalesce(new.paid_at::timestamptz, new.updated_at, new.created_at, now());
      update public.whatsapp_leads
      set first_payment_at = case
            when first_payment_at is null then payment_time
            else least(first_payment_at, payment_time)
          end,
          updated_at = now()
      where id = linked_lead and law_firm_id = new.law_firm_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_advos_installment_marks_first_payment on public.financial_installments;
create trigger trg_advos_installment_marks_first_payment
after insert or update of status, paid_at, contract_id on public.financial_installments
for each row execute function public.advos_installment_marks_first_payment();

-- Backfill de contratação/pagamento para leads vinculados a contratos existentes.
update public.whatsapp_leads l
set contracted_at = coalesce(l.contracted_at, x.first_contract_at)
from (
  select lead_id, min(created_at) as first_contract_at
  from public.financial_contracts
  where lead_id is not null and coalesce(lower(status), 'ativo') not in ('cancelado','cancelada','inativo','inativa')
  group by lead_id
) x
where l.id = x.lead_id;

update public.whatsapp_leads l
set first_payment_at = coalesce(l.first_payment_at, x.first_paid_at)
from (
  select c.lead_id,
         min(coalesce(i.paid_at::timestamptz, i.updated_at, i.created_at)) as first_paid_at
  from public.financial_installments i
  join public.financial_contracts c on c.id = i.contract_id
  where c.lead_id is not null and lower(coalesce(i.status, '')) = 'pago'
  group by c.lead_id
) x
where l.id = x.lead_id;

-- 4) Custos de mídia informados no AdvOS para CPL/CPA/ROI/ROAS.
-- A sincronização automática de gasto via APIs de anúncios fica desacoplada desta
-- tabela: integrações futuras podem gravar nela sem mudar o dashboard.
create table if not exists public.marketing_spend_entries (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  source_platform text not null,
  period_start date not null,
  period_end date not null,
  campaign_id text,
  campaign_name text,
  ad_id text,
  ad_name text,
  amount numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_platform in ('meta','google')),
  check (period_end >= period_start),
  check (amount >= 0)
);

create index if not exists idx_marketing_spend_firm_period
  on public.marketing_spend_entries(law_firm_id, period_start desc, period_end desc);
create index if not exists idx_marketing_spend_campaign
  on public.marketing_spend_entries(law_firm_id, source_platform, campaign_id);

alter table public.marketing_spend_entries enable row level security;
revoke all on table public.marketing_spend_entries from public, anon, authenticated;
grant all privileges on table public.marketing_spend_entries to service_role;

notify pgrst, 'reload schema';
commit;
