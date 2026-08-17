# AdvOS v9.84.2

## Correção de abertura da ficha do cliente

- A página `/app/clientes/[id]` não depende mais de joins relacionais opcionais para `documents`, `cases` e `document_signatures`.
- Consultas independentes e tolerantes a falhas foram adicionadas para evitar exceção server-side quando uma relação ou migration opcional estiver ausente.
- Documentos continuam exibindo assinatura e processo vinculados quando os registros existem.
- O vínculo de assinatura dos contratos gerados continua sendo resolvido diretamente por `document_signatures`.
