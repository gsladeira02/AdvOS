# AdvOS v9.84.7.10

## Correção definitiva do schema de signature_events
- `signature_events` agora recebe somente colunas existentes no schema real: law_firm_id, request_id, signer_id, event_type, ip, user_agent e metadata.
- Removido o campo inválido `mime` do insert da selfie; o MIME fica em `metadata.mime_type`.
- CPF, selfie_path e document_photo_path ficam em `metadata` da evidência e CPF/selfie/documento continuam em `signature_signers`.
- O evento final de assinatura agora verifica e reporta erros do Supabase em vez de ignorá-los.
- Nenhuma alteração de schema/migration é necessária para `signature_events`.
