# AdvOS v9.84.3

## Correção da ficha do cliente
- Corrigido erro server-side ao abrir clientes cujo documento gerado ainda não possui registro de assinatura/link persistido.
- A resolução de `signatureUrl` agora usa fallback seguro para string vazia antes de chamar `.trim()`.
- Versão atualizada para 9.84.3.
