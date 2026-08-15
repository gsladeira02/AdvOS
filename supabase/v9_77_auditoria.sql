-- AdvOS v9.77 — Auditoria e rastreabilidade
alter table public.activity_logs add column if not exists ip text;
alter table public.activity_logs add column if not exists user_agent text;
alter table public.activity_logs add column if not exists metadata jsonb;
alter table public.activity_logs add column if not exists before_data jsonb;
alter table public.activity_logs add column if not exists after_data jsonb;
create index if not exists idx_activity_logs_firm_created on public.activity_logs(law_firm_id, created_at desc);
revoke all on table public.activity_logs from public, anon, authenticated;
grant all privileges on table public.activity_logs to service_role;
