# AdvOS v9.78 — Configuração e segurança

## Migrations
Execute nesta ordem, caso ainda não tenham sido aplicadas:

- `supabase/v9_74_atividades_agenda.sql`
- `supabase/v9_75_modelos_documentos.sql`
- `supabase/v9_76_assinaturas_digitais.sql`
- `supabase/v9_77_auditoria.sql`
- `supabase/v9_78_crm_avancado.sql`

## Assinatura
A assinatura própria registra evidências e pode exigir selfie, foto do documento e OTP por WhatsApp.

A selfie simples é uma evidência visual e não equivale a reconhecimento facial/liveness automatizado. Para documentos que exigem assinatura qualificada ICP-Brasil, mantenha a integração com provedor/certificado adequado.

## Dados pessoais
Selfie e documento de identidade devem ser tratados como dados pessoais de alta sensibilidade operacional. O AdvOS armazena essas evidências em bucket privado, vincula acesso ao pedido de assinatura e registra consentimento e prazo de retenção.
