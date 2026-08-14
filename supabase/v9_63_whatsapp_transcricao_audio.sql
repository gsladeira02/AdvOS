-- AdvOS V9.63 — transcrição de áudios do WhatsApp
-- Rode uma vez no Supabase SQL Editor antes de usar a transcrição.

alter table public.whatsapp_messages
  add column if not exists transcription_text text,
  add column if not exists transcription_status text,
  add column if not exists transcription_model text,
  add column if not exists transcription_error text,
  add column if not exists transcribed_at timestamptz,
  add column if not exists transcribed_by uuid references auth.users(id) on delete set null;

create index if not exists idx_whatsapp_messages_transcription_status
on public.whatsapp_messages(law_firm_id, transcription_status)
where transcription_status is not null;

notify pgrst, 'reload schema';
