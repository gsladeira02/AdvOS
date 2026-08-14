# AdvOS v9.48

- Remove a exigência de MFA/TOTP do login.
- Login normal por e-mail e senha redireciona diretamente ao Dashboard.
- Remove a exigência AAL2 dos helpers internos.
- Rotas antigas de MFA passam a redirecionar ao sistema para compatibilidade.
- Remove o marcador `advos_mfa_required` de novos usuários.
- Atualiza a área Segurança para refletir o login normal.
- Inclui migração idempotente para retirar AAL2 das policies do Supabase sem remover RLS.
- Mantém expiração local de sessão, auditoria, rate limiting e demais hardenings da v9.39.
