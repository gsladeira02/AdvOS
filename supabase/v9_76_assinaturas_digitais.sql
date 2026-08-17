-- AdvOS v9.76 — Assinatura eletrônica própria com evidências e selfie
create table if not exists public.signature_requests (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  public_token text not null unique,
  status text not null default 'pendente',
  require_selfie boolean not null default true,
  require_document_photo boolean not null default false,
  require_otp boolean not null default true,
  consent_text text,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  signed_at timestamptz,
  final_document_path text,
  final_document_hash text
);
create table if not exists public.signature_signers (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  request_id uuid not null references public.signature_requests(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  cpf text,
  role text default 'signatario',
  status text not null default 'pendente',
  otp_hash text,
  otp_expires_at timestamptz,
  selfie_path text,
  document_photo_path text,
  signature_image_path text,
  signed_at timestamptz
);
create table if not exists public.signature_events (
  id uuid primary key default uuid_generate_v4(),
  law_firm_id uuid not null references public.law_firms(id) on delete cascade,
  request_id uuid not null references public.signature_requests(id) on delete cascade,
  signer_id uuid references public.signature_signers(id) on delete set null,
  event_type text not null,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents add column if not exists signature_request_id uuid references public.signature_requests(id) on delete set null;
alter table public.document_signatures add column if not exists signer_id uuid references public.signature_signers(id) on delete set null;
alter table public.document_signatures add column if not exists selfie_path text;
alter table public.document_signatures add column if not exists document_photo_path text;
alter table public.document_signatures add column if not exists audit_metadata jsonb;

insert into storage.buckets (id, name, public)
values ('signature-evidence', 'signature-evidence', false)
on conflict (id) do update set public = false;

alter table public.signature_requests enable row level security;
alter table public.signature_signers enable row level security;
alter table public.signature_events enable row level security;
revoke all on table public.signature_requests, public.signature_signers, public.signature_events from public, anon, authenticated;
grant all privileges on table public.signature_requests, public.signature_signers, public.signature_events to service_role;
drop policy if exists advos_signature_evidence_no_direct_access on storage.objects;
create policy advos_signature_evidence_no_direct_access on storage.objects for all to public using (bucket_id <> 'signature-evidence') with check (bucket_id <> 'signature-evidence');

create index if not exists idx_signature_requests_firm_status on public.signature_requests(law_firm_id, status, created_at desc);
create index if not exists idx_signature_signers_request on public.signature_signers(request_id, status);
create index if not exists idx_signature_events_request on public.signature_events(request_id, created_at desc);
alter table public.signature_requests add column if not exists consent_at timestamptz;
alter table public.signature_requests add column if not exists retention_until date default (current_date + 180);
alter table public.signature_signers add column if not exists consent_at timestamptz;
