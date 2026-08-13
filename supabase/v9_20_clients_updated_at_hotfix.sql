-- AdvOS V9.20 - Hotfix para erro clients.updated_at no WhatsApp/PWA
-- Rode no Supabase SQL Editor se o app mostrar: column clients.updated_at does not exist

alter table public.clients
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_updated_at on public.clients;

create trigger trg_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
