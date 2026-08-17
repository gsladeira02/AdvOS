# AdvOS v9.31

## Correção
O middleware de segurança da v9.30 tentava interpretar todo header `Origin` como URL. O valor especial `null`, válido para origens opacas, gerava `Origem inválida.` e podia bloquear ações legítimas no WhatsApp Calling/PWA.

## Segurança mantida
- `Sec-Fetch-Site: cross-site` continua bloqueado.
- Origem explícita precisa coincidir com o domínio público do AdvOS.
- `Origin: null` não é liberado de forma irrestrita: exige `same-origin` ou `Referer` do AdvOS.
- Webhooks continuam usando validação própria.

Não exige SQL.
