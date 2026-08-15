# AdvOS v9.73 — checklist de segurança

## 1. SQL

Execute uma vez:

`supabase/v9_73_security_hardening.sql`

Depois, opcionalmente:

`supabase/v9_73_security_verify.sql`

As duas primeiras consultas da verificação devem retornar **zero linhas**.

## 2. Supabase Auth — proteção de senha vazada

Essa opção não é configurada por SQL nesta versão.

No painel do Supabase:

**Authentication → Password Security → Leaked password protection → Enabled**

Isso ativa a rejeição de senhas comprometidas conhecidas.

## 3. O que a v9.73 fecha

- RPC execution pública das SECURITY DEFINER detectadas pelo linter.
- Execução de funções públicas para `anon` e `authenticated` por padrão.
- Criação de novos objetos no schema `public` pela API.
- Acesso CRUD direto às tabelas do AdvOS pelo token do navegador.
- Mantém somente os SELECTs necessários para o perfil e Realtime do WhatsApp.
- Mantém RLS habilitado nas tabelas atuais.
- Mantém o bucket `documents` privado.
- Fortalece o `search_path` das SECURITY DEFINER afetadas.

## 4. Observação

As funções de trigger continuam operacionais mesmo sem EXECUTE para `anon`/`authenticated` porque são executadas pelo PostgreSQL no contexto do trigger. A migration não depende de RPC público para o funcionamento do AdvOS.
