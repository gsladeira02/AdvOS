# AdvOS v9.47

- Centraliza o pós-login em `/auth/continue`.
- Login valida perfil ativo imediatamente após senha.
- MFA concluído volta para `/auth/continue` antes do dashboard.
- Remove bloqueio legado por `subscriptions` do AppShell (instalação single-office).
- Login exibe erros de usuário sem perfil, usuário inativo, sessão e MFA.
