# AdvOS v9.80.3

## Correção do envio do link de assinatura pelo WhatsApp
- Corrigida a origem do link usado pelo botão "Enviar pelo WhatsApp" na ficha do cliente.
- O sistema agora busca o `signature_url` salvo no registro de assinatura do documento como fonte principal.
- `generated_contracts.zapsign_url` permanece apenas como fallback de compatibilidade com registros antigos.
- O botão bloqueia o envio quando não existe um link de assinatura válido, evitando mensagens incompletas.
- A mensagem agora usa o rótulo "Assinatura digital" em vez de "ZapSign".
- O envio continua sendo feito exclusivamente pela API oficial do WhatsApp (`/api/whatsapp/send`).
