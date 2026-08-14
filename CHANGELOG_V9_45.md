# AdvOS v9.45

- Login movido para rota server-side `/api/auth/login`.
- Sessão Supabase passa a ser gravada no servidor antes do redirecionamento para MFA.
- Login não depende mais de `signInWithPassword()` no browser.
- Timeout de 15s e mensagens claras de falha/conexão.
- Navegação completa para `/auth/mfa/setup` após autenticação.
- Corrigida leitura de fatores TOTP para `factor_type`.
- Mantidas as proteções MFA/AAL2 da v9.39+.
