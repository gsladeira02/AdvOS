# AdvOS v9.82.1

## Correção da visualização do documento na assinatura

- Corrige bloqueio do PDF no iframe causado por `X-Frame-Options: DENY` global.
- Rotas de visualização de documentos agora permitem framing somente pela própria origem (`SAMEORIGIN`).
- A página pública `/assinar/:token` continua sem exigir autenticação.
- A visualização obrigatória antes da assinatura permanece.
- Não altera o fluxo de OTP/selfie do cliente nem a assinatura interna de Daniel Costa Ladeira.
