-- AdvOS v9.62 — foto privada do cliente
alter table public.clients
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz;

comment on column public.clients.avatar_path is 'Caminho privado da foto do cliente no bucket documents.';
comment on column public.clients.avatar_updated_at is 'Data da última alteração da foto do cliente; usada também para invalidar cache.';
