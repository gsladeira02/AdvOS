-- AdvOS v9.48 — verificação da remoção do MFA obrigatório
-- Deve retornar as três policies sem referência a aal2.

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and policyname in (
    'profiles_self_active_select',
    'whatsapp_conversations_active_user_select',
    'whatsapp_messages_active_user_select'
  )
order by tablename, policyname;
