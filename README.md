# AdvOS v9.57

Versão atual do AdvOS, mantendo o hardening de segurança da v9.39 e incorporando todas as evoluções até a v9.57.

## Destaques
- Qualificação automática de leads vindos de Meta Ads e Google Ads, com origem, campanha/anúncio, identificadores de clique, score e área jurídica provável.
- Rastreamento Google Ads → WhatsApp por URL própria com GCLID/GBRAID/WBRAID e ValueTrack.
- Respostas automáticas para novos leads e palavras-chave no WhatsApp.
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

Leia `SECURITY_SETUP_V9_39.md` antes do deploy e execute os SQLs na ordem indicada.
