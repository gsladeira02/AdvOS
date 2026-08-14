# AdvOS v9.39

Versão de hardening de segurança sobre a v9.38.

## Destaques
- MFA TOTP obrigatório para usuários internos.
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
