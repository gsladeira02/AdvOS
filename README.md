# AdvOS V9.27

Sistema jurídico interno do escritório, com acesso pela internet, Supabase, Next.js e Vercel.

## Correções da V9.27

Esta versão mantém todo o hardening da V9.26 e corrige dois pontos operacionais:

- logout reforçado no navegador e no servidor, com botão também no mobile e retorno sempre ao `/login` do domínio atual;
- WhatsApp com Realtime autenticado explicitamente e polling resiliente como fallback para novas mensagens/conversas aparecerem sem F5.

**Não existe SQL novo para a V9.27.** Se o `v9_26_security_hardening.sql` já foi executado, não rode novamente por causa desta atualização. Asaas e ZapSign continuam no projeto e podem permanecer sem configuração até serem usados no futuro.


## Atualização da V9.25 para V9.26

Esta versão inclui hardening de segurança. A ordem recomendada é:

1. Configure na Vercel `WHATSAPP_APP_SECRET` com o App Secret da aplicação Meta.
2. Publique o código da V9.26.
3. Rode `supabase/v9_26_security_hardening.sql` no SQL Editor do Supabase.
4. Em Integrações, confirme os webhooks do Asaas, ZapSign e WhatsApp.
5. Ative Leaked Password Protection no Supabase Auth.
6. Rode `supabase/v9_26_security_verify.sql` e o Security Advisor.
7. Teste as principais telas e integrações.

> Não rode o SQL de hardening antes de publicar a V9.26: versões anteriores ainda dependem de acesso direto do navegador a algumas tabelas e podem parar de funcionar.

## Variáveis principais

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
WHATSAPP_APP_SECRET=
```

As demais variáveis opcionais estão documentadas em `.env.example`.

## Segurança herdada da V9.26

- autenticação do servidor revalidada via Supabase Auth;
- `service_role` somente server-side;
- CRUD jurídico pelo backend;
- RLS e privilégios mínimos no Data API;
- bucket `documents` privado e sem acesso direto pelo JWT do navegador;
- documentos/mídias persistidos servidos por endpoints autenticados;
- assinatura do webhook Meta e tokens de webhook Asaas/ZapSign;
- proteção contra alteração de Base URL de integrações/SSRF;
- PWA sem cache de telas ou dados autenticados;
- limites de payload/upload, proteção CSRF e headers de segurança;
- Next.js/React/SheetJS atualizados para versões corrigidas usadas nesta revisão.

Leia `SECURITY_AUDIT_V9_26.md` antes do deploy.

## Observações

- O pacote não inclui `.env`, `.git`, `node_modules` nem `package-lock.json`.
- O bucket `documents` deve continuar privado.
- Usuários novos devem ser criados por um administrador do AdvOS; `/api/setup` não cria escritório ou perfil automaticamente.
- Em produção, o webhook do WhatsApp exige `WHATSAPP_APP_SECRET` válido.
