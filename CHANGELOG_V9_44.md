# AdvOS v9.44

- Corrige tipagem MFA no build de produção.
- Usa `factor_type` (campo real retornado pelo Supabase) ao ler fatores MFA.
- Remove fallback inválido `factorType` dos objetos `Factor`.
- Mantém `factorType: 'totp'` apenas no `mfa.enroll()`, onde esse é o nome correto do parâmetro de entrada.
