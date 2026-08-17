-- AdvOS v9.59 — Financeiro na ficha do cliente + forma de pagamento + exclusão de mensagens
-- Execute uma vez no SQL Editor do Supabase antes do deploy.

begin;

-- Forma de pagamento é independente do billing_type do Asaas.
alter table public.financial_installments
  add column if not exists payment_method text;

create index if not exists idx_financial_installments_payment_method
  on public.financial_installments(law_firm_id, payment_method);

-- Backfill seguro dos tipos que já existiam no Asaas.
update public.financial_installments
set payment_method = case upper(coalesce(billing_type, ''))
  when 'PIX' then 'pix'
  when 'BOLETO' then 'boleto'
  when 'CREDIT_CARD' then 'cartao_credito'
  when 'UNDEFINED' then 'cliente_escolhe'
  else payment_method
end
where payment_method is null and billing_type is not null;

-- "Apagar para mim" não deve apagar a mensagem dos demais usuários do escritório.
create table if not exists public.whatsapp_message_user_hides (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(message_id, auth_user_id)
);

create index if not exists idx_whatsapp_message_user_hides_user
  on public.whatsapp_message_user_hides(law_firm_id, auth_user_id, message_id);

alter table public.whatsapp_message_user_hides enable row level security;
revoke all on table public.whatsapp_message_user_hides from public, anon, authenticated;
grant all privileges on table public.whatsapp_message_user_hides to service_role;

-- Coluna já existia em versões anteriores, mas fica garantida para instalações antigas.
alter table public.whatsapp_messages
  add column if not exists deleted_for_all boolean not null default false;

notify pgrst, 'reload schema';
commit;
