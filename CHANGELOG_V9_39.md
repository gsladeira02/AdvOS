# AdvOS v9.39 — Security Hardening II

- MFA TOTP obrigatório para todos os usuários internos.
- AAL2 exigido no servidor e nas RLS de profiles/WhatsApp Realtime.
- Tela de configuração e desafio MFA.
- Limpeza de fatores TOTP não verificados abandonados antes de novo cadastro.
- Logout após 60 min de inatividade e limite local de 12 h por sessão.
- CSP dinâmica com nonce e allowlist de conexão Supabase.
- Headers de segurança reforçados.
- Upload manual valida extensão + assinatura real do arquivo.
- Mídias recebidas do WhatsApp também passam por validação real antes de serem arquivadas.
- Download de mídia da Meta aceita apenas HTTPS em domínios controlados pela Meta.
- Tipos executáveis, scripts, HTML/SVG e formatos Office com macro são bloqueados.
- Rate limiting server-side persistente para ações sensíveis, WhatsApp, uploads e leitura em massa de documentos/mídias.
- Tabela de eventos de segurança.
- Admin pode desativar/reativar usuários; conta desativada também é bloqueada no Supabase Auth.
- Erros internos do banco são filtrados em endpoints críticos do WhatsApp.
- Página administrativa Segurança com eventos recentes.
- Migração pós-deploy e SQL de verificação incluídos.
