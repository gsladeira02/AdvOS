-- AdvOS v9.74 — Central de atividades + agenda + tarefas
alter table public.tasks add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.tasks add column if not exists case_id uuid references public.cases(id) on delete set null;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists source text default 'manual';
alter table public.tasks add column if not exists related_entity text;
alter table public.tasks add column if not exists related_entity_id uuid;

alter table public.calendar_events add column if not exists responsible text;
alter table public.calendar_events add column if not exists status text default 'agendado';
alter table public.calendar_events add column if not exists reminder_minutes integer default 30;

create index if not exists idx_tasks_firm_due_status on public.tasks(law_firm_id, due_date, status);
create index if not exists idx_calendar_events_firm_start on public.calendar_events(law_firm_id, starts_at);

alter table public.tasks enable row level security;
alter table public.calendar_events enable row level security;
revoke all on table public.tasks from public, anon, authenticated;
revoke all on table public.calendar_events from public, anon, authenticated;
grant all privileges on table public.tasks to service_role;
grant all privileges on table public.calendar_events to service_role;
