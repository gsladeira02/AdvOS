# AdvOS v9.39 — checklist de segurança de produção

## Ordem de implantação

1. Faça backup da v9.38 e, se possível, do banco.
2. Publique a v9.39 na Vercel.
3. Confirme que o build ficou `Ready`.
4. Entre com a conta administradora. Após e-mail/senha, o AdvOS deverá exigir configuração ou desafio TOTP.
5. Conclua o MFA do administrador.
6. Sem demora, execute `supabase/v9_39_security_hardening_ii.sql` no SQL Editor.
7. Execute `supabase/v9_39_security_verify.sql` e confira os resultados.
8. Teste login, WhatsApp, documentos, usuários e logout.

> O SQL deve ser executado somente depois da v9.39 estar publicada, pois passa a exigir AAL2 também nas policies do Supabase.

## Supabase Auth

Depois da migração:

1. Ative **Leaked Password Protection**, se disponível no seu plano.
2. Mantenha a expiração do JWT em aproximadamente **1 hora**.
3. Se o plano permitir, configure **Time-box user sessions = 12 horas**.
4. Se o plano permitir, configure **Inactivity timeout = 60 minutos**.
5. Mantenha o cadastro público desabilitado; usuários do AdvOS devem ser criados pelo administrador.

A v9.39 também encerra a interface após 60 min de inatividade/12 h de sessão como proteção complementar do dispositivo. As regras de sessão do Supabase, quando habilitadas, são a proteção autoritativa no servidor.

## Vercel Firewall / WAF

Configure regras de rate limiting para complementar os limites internos do AdvOS, principalmente em:

- tráfego abusivo contra login/autenticação;
- `/api/whatsapp/send`;
- `/api/whatsapp/send-media`;
- `/api/whatsapp/special`;
- `/api/users`;
- `/api/integrations`;
- `/api/client-files/upload`.

Não coloque challenge de navegador em `/api/webhooks/*`; webhooks usam suas próprias assinaturas/tokens.

## MFA

Cada usuário cadastra um aplicativo TOTP, como Google Authenticator, Microsoft Authenticator ou 1Password. Uma sessão apenas com senha fica em AAL1; a v9.39 exige AAL2 para telas, APIs internas e leitura Realtime do WhatsApp.

## Usuário desligado

Use **Usuários → Desativar**. O perfil é marcado como inativo e o usuário é bloqueado no Supabase Auth. Para restabelecer o acesso, use **Ativar**.

## Depois do deploy

Rode novamente o Security Advisor do Supabase e exporte o CSV para revisão. Também confira os logs da Vercel/Supabase após os testes de login e WhatsApp.
