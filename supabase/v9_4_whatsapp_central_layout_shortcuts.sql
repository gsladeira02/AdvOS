-- AdvOS V9.4 — WhatsApp central, contatos de clientes e atalhos de modelos

alter table public.message_templates
  add column if not exists shortcut text;

update public.message_templates
set shortcut = '/' || regexp_replace(
  lower(coalesce(nullif(slug, ''), nullif(name, ''), 'modelo')),
  '[^a-z0-9_]+',
  '_',
  'g'
)
where shortcut is null or trim(shortcut) = '';

create index if not exists idx_message_templates_law_firm_shortcut
on public.message_templates(law_firm_id, shortcut);

-- Opcional, mas ajuda a central do WhatsApp caso você habilite Realtime no Supabase.
alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.whatsapp_conversations;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.whatsapp_messages;
  exception when duplicate_object then
    null;
  end;
end $$;

notify pgrst, 'reload schema';
