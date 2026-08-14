# AdvOS v9.64

Versão atual do AdvOS, mantendo o hardening de segurança da v9.39 e incorporando todas as evoluções até a v9.64.

## Destaques
- Painel Marketing & Comercial com funil do lead ao pagamento, receita por Meta/Google/campanha/anúncio, conversão, CPL, CPA, ROI e ROAS.
- Motivo de perda obrigatório, histórico de etapas e tempo médio por etapa.
- Vínculo automático entre lead, cliente, contrato financeiro e pagamentos para preservar a atribuição da origem.
- Qualificação automática de leads vindos de Meta Ads e Google Ads, com origem, campanha/anúncio, identificadores de clique, score e área jurídica provável.
- Rastreamento Google Ads → WhatsApp por URL própria com GCLID/GBRAID/WBRAID e ValueTrack.
- Respostas automáticas para novos leads e palavras-chave no WhatsApp.
- Filtros do WhatsApp por tipo de contato, etapa, origem e status de leitura (todas, lidas ou não lidas), com painel responsivo no PWA.
- Senhas internas com mínimo de 6 caracteres alfanuméricos e gestão de administradores.
- Compactação automática de documentos antes do armazenamento e opção de conversão para PDF nos formatos compatíveis.
- Login interno por e-mail e senha, com usuários cadastrados/ativos, sessão controlada e trilha de segurança.
- AAL2 exigido no servidor e nas RLS expostas ao navegador.
- Sessão local com encerramento por inatividade e tempo máximo.
- CSP com nonce e headers de segurança reforçados.
- Rate limiting persistente para operações sensíveis.
- Uploads e mídias validados por extensão + assinatura real do arquivo.
- Downloads de mídia da Meta limitados a origens HTTPS controladas pela Meta.
- Eventos de segurança separados do histórico funcional.
- Administração para ativar/desativar usuários.
- Menos detalhes internos expostos em respostas de erro.

Leia `SECURITY_SETUP_V9_39.md` antes do deploy e execute os SQLs na ordem indicada. Para esta versão, execute também `supabase/v9_58_comercial_marketing.sql`.

## v9.62 — Foto do cliente

A ficha do cliente agora aceita foto privada. A imagem é otimizada automaticamente e aparece em Clientes e no WhatsApp. Execute `supabase/v9_62_foto_cliente.sql` antes de usar o recurso.

## v9.63 — Transcrição de áudios do WhatsApp

Mensagens de voz agora possuem a ação **Transcrever áudio**. O texto fica salvo na própria mensagem e não é processado novamente. Configure a chave em **Integrações → Transcrição de áudios** e execute `supabase/v9_63_whatsapp_transcricao_audio.sql` antes de usar o recurso.


## v9.64 — Hotfix de transcrição

Corrige falhas genéricas de transcrição, melhora a preparação de OGG/Opus para WAV 16 kHz e passa a diferenciar erros de migration, API Key, permissão, cota/faturamento, formato e timeout. Execute `supabase/v9_64_transcricao_audio_hotfix.sql` mesmo que a migration v9.63 já tenha sido aplicada.

## V9.65 — Transcrição de áudio

Em **Integrações → Transcrição de áudios**, deixe o status como **Ativada**, salve a OpenAI API Key (ou configure `OPENAI_API_KEY` na Vercel) e use **Testar transcrição**. O teste precisa retornar sucesso antes do uso no WhatsApp. Não há SQL novo na v9.65; mantenha aplicada a migration `supabase/v9_64_transcricao_audio_hotfix.sql`.
