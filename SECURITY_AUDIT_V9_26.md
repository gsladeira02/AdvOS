# AdvOS V9.26 — Auditoria e Hardening de Segurança

Data da revisão: 13/08/2026

## Escopo

Revisão estática da V9.25 com foco em ataques externos contra um sistema jurídico single-office acessível de qualquer rede. Foram revisados autenticação, autorização, RLS, Data API, Storage, webhooks, integrações, uploads, PWA/cache, headers HTTP, endpoints com `service_role`, dependências críticas e exposição de erros.

## Resultado executivo

A V9.25 tinha controles úteis no Supabase, mas ainda dependia demais do JWT do navegador para CRUD, usava `getSession()` como base de autenticação no servidor, aceitava webhooks sem autenticação forte em alguns provedores, permitia configurar Base URLs de integrações, mantinha páginas internas no Cache Storage do PWA e utilizava versões de dependências que precisavam de atualização de segurança.

A V9.26 muda a fronteira de confiança: o navegador não grava diretamente nas tabelas do AdvOS; operações de negócio passam pelo backend, que revalida o usuário com Supabase Auth e usa `service_role` somente no servidor. O Data API do navegador fica limitado ao próprio perfil ativo e aos SELECTs necessários ao Realtime do WhatsApp.

## Correções implementadas

### Autenticação e autorização

- Autorização do servidor passou de `auth.getSession()` para `auth.getUser()`.
- Usuário sem perfil ativo é recusado; não existe mais criação automática de escritório/perfil.
- `/api/setup` foi desativado.
- Administração de usuários e integrações exige perfil administrativo.
- Criação de novos usuários é admin-only, atribui papel `membro` e exige senha provisória de pelo menos 12 caracteres.
- Módulo com `service_role` está marcado `server-only`.
- Nenhum componente `use client` importa o cliente administrativo.

### Banco, RLS e Data API

- RLS permanece habilitado nas 22 tabelas do AdvOS.
- Policies históricas `FOR ALL` são removidas.
- `anon` e `authenticated` perdem INSERT/UPDATE/DELETE direto em todas as tabelas do sistema.
- `authenticated` mantém somente SELECT do próprio perfil ativo e das duas tabelas necessárias ao Realtime do WhatsApp.
- `current_law_firm_id()` é removida; com isso deixa de existir o helper `SECURITY DEFINER` público que originava o WARN remanescente do Security Advisor.
- Execução RPC no schema `public` é revogada de `PUBLIC`, `anon` e `authenticated` por padrão.
- Default privileges futuros também passam a exigir concessão explícita para objetos expostos ao navegador.
- O backend mantém acesso com `service_role`.

### Storage e documentos

- Bucket `documents` é forçado para `public = false`.
- Policy restritiva impede acesso direto de `anon` e `authenticated` ao bucket jurídico.
- Documentos da pasta do cliente são servidos por `/api/documents/file/[documentId]`, com autenticação, escopo do escritório, `no-store`, `nosniff`, limite de tamanho e Content-Disposition controlado.
- Mídias persistidas do WhatsApp também passam pelo endpoint autenticado do AdvOS.
- Signed URLs antigas persistidas em mensagens do WhatsApp são removidas quando existe `storage_path`.
- Signed URL usado para envio de mídia à Meta tem duração curta e não é persistido no banco.

### Webhooks

- WhatsApp POST valida `X-Hub-Signature-256` por HMAC-SHA256 usando `WHATSAPP_APP_SECRET`; em produção, sem App Secret o webhook recusa eventos.
- Asaas valida `asaas-access-token` contra o segredo configurado para o webhook.
- ZapSign valida `X-AdvOS-Webhook-Token`; segredo não é mais aceito em query string.
- Payloads dos webhooks têm limites explícitos.
- Atualizações recebidas de webhooks são escopadas pelo `law_firm_id` da integração autenticada.

### Integrações e SSRF

- Base URL do Asaas é fixada nos hosts oficiais de produção/sandbox.
- Base URL da ZapSign é fixada no host oficial.
- WhatsApp aceita apenas `https://graph.facebook.com/vN[.N]`.
- Campos Base URL ficaram read-only na interface.
- Envio de documento à ZapSign não baixa mais `external_url` arbitrária: somente arquivo do bucket privado é aceito.
- Redirects de retorno do Asaas/contratos são limitados a caminhos internos.

### Uploads e payloads

- Upload de pasta do cliente: máximo 10 arquivos por requisição e 25 MB por arquivo.
- Tipos web/executáveis perigosos são bloqueados e os arquivos são servidos depois com `nosniff`/Content-Disposition controlado.
- Importação do Asaas: somente XLSX/XLS/CSV, até 10 MB e até 50 mil linhas.
- WhatsApp aplica limites específicos para áudio, figurinha e demais mídias.
- Middleware aplica limites de Content-Length aos endpoints mutáveis.

### CSRF, cache e headers

- Middleware bloqueia mutações `cross-site` por `Sec-Fetch-Site` e rejeita `Origin` diferente da origem do AdvOS.
- Webhooks são exceção porque têm autenticação servidor-servidor própria.
- `/app/*` e `/api/*` recebem `Cache-Control: no-store`.
- O Service Worker não armazena páginas autenticadas, APIs, login ou navegação; apenas manifest, ícones e página offline.
- Headers adicionados: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, Permissions-Policy e CSP mínima para `frame-ancestors`, `object-src`, `base-uri` e `form-action`.

### Dependências críticas

- Next.js: 15.5.9 → 15.5.21.
- React / React DOM: 19.0.0 → 19.0.4.
- SheetJS/XLSX: 0.18.5 → tarball oficial 0.20.3 do SheetJS CDN.
- O pacote continua sem `package-lock.json`, seguindo a estrutura recebida. Para segurança de supply chain, um lockfile reproduzível em CI é recomendado quando o fluxo de deploy permitir.

## Validações executadas

- 81 arquivos TypeScript/TSX examinados pelo compilador em modo estático/no-resolve: zero erros sintáticos e zero erros semânticos internos relevantes após filtrar módulos/types ausentes do ambiente.
- Nenhuma chamada `supabase.from()` permanece no código executado pelo navegador.
- Nenhum componente cliente importa `createAdminSupabase`.
- Nenhum `.env`, `.env.local`, `.git`, `node_modules` ou `package-lock.json` está presente no pacote.
- Nenhum uso encontrado de `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval` ou `new Function`.
- Todas as rotas de API que usam `service_role` são autenticadas por perfil ou são webhooks com validação própria; `/api/setup` fica permanentemente bloqueado.
- IDs de registros sensíveis nos endpoints revisados são escopados por `law_firm_id` quando operam sobre registros existentes.

## Limitações desta auditoria

Esta é uma revisão estática e de arquitetura. O ambiente de análise não tinha acesso de rede para instalar dependências, por isso não foi possível executar `npm install`, `npm audit` nem um `next build` real da V9.26. O deploy na Vercel deve confirmar o build com as dependências efetivamente instaladas.

Também não foi executado pentest dinâmico contra a aplicação publicada, DAST, scanner autenticado ou teste de carga. Nenhum sistema pode ser considerado 100% inviolável apenas por revisão de código.

## Ações manuais obrigatórias após publicar a V9.26

1. Configurar `WHATSAPP_APP_SECRET` na Vercel com o App Secret real da aplicação Meta antes de depender do recebimento de mensagens em produção.
2. Executar `supabase/v9_26_security_hardening.sql` no SQL Editor do projeto Supabase.
3. Configurar no webhook da ZapSign o header `X-AdvOS-Webhook-Token` com o segredo exibido em Integrações.
4. Recriar/confirmar o webhook do Asaas pelo AdvOS para que `authToken` fique sincronizado com o segredo armazenado.
5. Ativar Leaked Password Protection no Supabase Auth.
6. Rodar novamente o Supabase Security Advisor e o arquivo `supabase/v9_26_security_verify.sql`.
7. Fazer smoke test: login, dashboard, clientes, pasta/documentos, processos, prazos, tarefas, financeiro, integrações e WhatsApp (texto + mídia + recebimento).

## Próxima camada recomendada

Depois de estabilizar a V9.26, as prioridades são: MFA obrigatório; políticas de sessão/expiração; WAF e rate limiting na Vercel; rotação e inventário de segredos; mover tokens de integrações para armazenamento criptografado/Vault ou variáveis de ambiente quando possível; CSP com nonce completa; CI com lockfile e auditoria de dependências; e pentest autenticado em ambiente de homologação.
