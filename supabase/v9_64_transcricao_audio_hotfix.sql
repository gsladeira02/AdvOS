-- AdvOS V9.64 — hotfix de transcrição de áudio
-- Pode ser executado mesmo se a migration V9.63 já tiver sido aplicada.

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
