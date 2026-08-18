# AdvOS v9.84.7.8

## Correção do registro da selfie
- Removido `cpf` como coluna direta de `signature_events`.
- CPF da selfie é salvo em `signature_signers.cpf` e na coluna JSON `metadata` do evento.
- `signature_signers.cpf` passou a ser carregado no resolvedor do fluxo público.
- Mantidos selfie, documento, IP e user-agent nas evidências.
- Corrige o erro: `Could not find the 'cpf' column of 'signature_events' in the schema cache`.
