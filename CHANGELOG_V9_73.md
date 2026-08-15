# AdvOS v9.73 — Estabilidade e Hardening

## Segurança
- Corrige os alertas do Supabase Linter para as SECURITY DEFINER que continuavam executáveis via Data API após migrações posteriores.
- Bloqueia `EXECUTE` para `public`, `anon` e `authenticated` nas funções públicas; `service_role` permanece autorizado.
- Endurece o `search_path` das SECURITY DEFINER afetadas.
- Fecha criação de objetos no schema `public` pela API.
- Reaplica RLS e menor privilégio nas tabelas do AdvOS.
- Mantém apenas os SELECTs necessários para `profiles`, `whatsapp_conversations` e `whatsapp_messages`.
- Mantém o bucket `documents` privado.
- Adiciona verificação pós-migration em `supabase/v9_73_security_verify.sql`.

## Auth
- Documenta a ativação de Leaked Password Protection no Dashboard do Supabase.

## Compatibilidade
- Preserva os fluxos atuais de WhatsApp, Financeiro, Leads, Marketing e exportação.
- Sem mudança de schema funcional para mensagens, clientes ou financeiro.
