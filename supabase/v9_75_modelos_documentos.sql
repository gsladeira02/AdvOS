-- AdvOS v9.75 — Modelos de documentos
create table if not exists public.document_templates (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  name text not null,
  category text,
  content text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_document_templates_firm on public.document_templates(law_firm_id, active, name);
alter table public.document_templates enable row level security;
revoke all on table public.document_templates from public, anon, authenticated;
grant all privileges on table public.document_templates to service_role;
