# AdvOS v9.78 — pacote cumulativo 9.74 → 9.78

## v9.74 — Central de atividades + Agenda
- Central de atividades com WhatsApp não lido, tarefas e financeiro em atraso.
- Agenda de reuniões, audiências e retornos.

## v9.75 — Documentos + Modelos
- Cadastro de modelos.
- Variáveis: `{{cliente}}`, `{{cpf}}`, `{{telefone}}`, `{{email}}`, `{{endereco}}`, `{{data}}`.
- Geração de PDF para a pasta do cliente.

## v9.76 — Assinatura eletrônica
- Link público exclusivo.
- Visualização do PDF.
- Selfie no momento da assinatura.
- Foto do documento opcional.
- OTP por WhatsApp opcional, ativado por padrão.
- Assinatura desenhada em canvas.
- Assinatura visual no PDF + certificado de evidências.
- Hash SHA-256 do documento final.
- Registro de eventos, consentimento e prazo de retenção.
- Evidências em bucket privado.

## v9.77 — Auditoria
- Auditoria administrativa centralizada.
- Dados de contexto para eventos novos.
- Tela restrita a administradores.

## v9.78 — CRM jurídico avançado
- Valor potencial, probabilidade, responsável e próxima ação.
- Motivo de perda.
- Histórico de mudança de etapa.
- Pipeline do lead até contratação.

## Migrations
Execute nesta ordem no Supabase:
1. `supabase/v9_74_atividades_agenda.sql`
2. `supabase/v9_75_modelos_documentos.sql`
3. `supabase/v9_76_assinaturas_digitais.sql`
4. `supabase/v9_77_auditoria.sql`
5. `supabase/v9_78_crm_avancado.sql`

## Assinatura e privacidade
A selfie é uma evidência visual do processo. Ela não significa reconhecimento facial ou liveness automatizado. Quando o documento exigir assinatura qualificada ICP-Brasil, continue usando a integração/certificado apropriado.

Selfies e documentos de identidade devem ser tratados com proteção reforçada, retenção limitada e acesso restrito ao escritório.
