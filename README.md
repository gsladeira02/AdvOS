# AdvOS V9.32

Sistema jurídico interno com Next.js, Supabase e Vercel.

## V9.32 — Central WhatsApp / CRM

- Central dividida em **Atendimento** e **Financeiro/Jurídico**.
- Transferência de conversa entre setores.
- Leads separados de clientes; nenhum lead vira cliente automaticamente.
- Funil de leads e edição dos detalhes do lead.
- Botão manual **Cadastrar como cliente**.
- Tags nas conversas.
- Mídias recebidas de clientes vinculadas automaticamente à Pasta do Cliente.
- Mídias de um lead são vinculadas à Pasta do Cliente no momento da conversão.
- Mantém chamadas, localização, enquetes, eventos, Realtime e correções anteriores.

## Migração obrigatória

Antes de publicar a v9.32, rode no SQL Editor do Supabase:

`supabase/v9_32_whatsapp_atendimento_leads_tags.sql`

A migração é aditiva e pode ser executada com a v9.31 ainda publicada.
