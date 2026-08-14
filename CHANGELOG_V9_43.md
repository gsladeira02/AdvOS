# AdvOS v9.43

- Corrige a tipagem do fluxo MFA no build de produção.
- Remove casts `any` de `supabase.auth.mfa` que faziam `withTimeout()` inferir `unknown`.
- Mantém o fluxo de login/MFA e as correções tipográficas da v9.42.
- Nenhuma migração SQL nova.
