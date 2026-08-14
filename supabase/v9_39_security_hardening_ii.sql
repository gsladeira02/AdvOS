-- AdvOS v9.39 — Security Hardening II
-- MFA/AAL2 em RLS, auditoria de segurança e rate limiting server-side.
-- Rode APÓS publicar a v9.39 para evitar bloquear a v9.38, que não exige MFA.

begin;

-- 1) Eventos de segurança separados do histórico funcional.
create table if not exists public.security_events (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid references public.law_firms(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (severity in ('info','warning','critical'))
);

create index if not exists idx_security_events_firm_created
  on public.security_events(law_firm_id, created_at desc);
create index if not exists idx_security_events_user_created
  on public.security_events(auth_user_id, created_at desc);

alter table public.security_events enable row level security;
revoke all on table public.security_events from public, anon, authenticated;
grant all privileges on table public.security_events to service_role;

-- 2) Buckets do rate limiter. Só o backend/service_role acessa.
create table if not exists public.security_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.security_rate_limits enable row level security;
revoke all on table public.security_rate_limits from public, anon, authenticated;
grant all privileges on table public.security_rate_limits to service_role;

create or replace function public.advos_consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_started timestamptz;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return false;
  end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.security_rate_limits(bucket_key, window_started_at, hit_count, updated_at)
  values (left(p_key, 240), v_now, 1, v_now)
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when public.security_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
      then v_now else public.security_rate_limits.window_started_at end,
    hit_count = case
      when public.security_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
      then 1 else public.security_rate_limits.hit_count + 1 end,
    updated_at = v_now
  returning hit_count, window_started_at into v_count, v_started;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.advos_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.advos_consume_rate_limit(text, integer, integer) to service_role;

-- Limpeza automática simples dos buckets antigos pode ser feita manualmente/cron.
create index if not exists idx_security_rate_limits_updated
  on public.security_rate_limits(updated_at);

-- 3) MFA também é exigido diretamente nas únicas tabelas que o navegador lê.
-- Isso impede que uma sessão só com senha (aal1) use o Data API/Realtime.
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

-- 4) Reaplica menor privilégio nas tabelas criadas depois da v9.26.
do $$
declare
  t text;
begin
  foreach t in array array[
    'whatsapp_leads',
    'whatsapp_tags',
    'whatsapp_conversation_tags',
    'whatsapp_lead_stages',
    'whatsapp_preferences',
    'whatsapp_internal_notes',
    'whatsapp_conversation_events',
    'security_events',
    'security_rate_limits'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
      execute format('grant all privileges on table public.%I to service_role', t);
    end if;
  end loop;
end $$;

-- 5) Storage jurídico continua privado e sem acesso direto do JWT.
update storage.buckets set public = false where id = 'documents';
drop policy if exists "advos_documents_no_direct_access" on storage.objects;
create policy "advos_documents_no_direct_access"
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'documents')
with check (bucket_id <> 'documents');

-- 6) Funções públicas continuam fechadas por padrão.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.advos_consume_rate_limit(text, integer, integer) to service_role;

commit;
notify pgrst, 'reload schema';
