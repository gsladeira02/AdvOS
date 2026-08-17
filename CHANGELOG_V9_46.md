# AdvOS v9.46 — Login robusto e CSP dinâmica

- Login deixou de depender de hidratação/JavaScript: formulário HTML nativo envia credenciais ao backend.
- `/api/auth/login` aceita formulário `application/x-www-form-urlencoded` e JSON, mantendo limite de payload.
- Login passa a redirecionar no servidor para o fluxo MFA após a sessão ser gravada em cookies.
- Erros de login retornam à tela por código seguro na URL, sem expor detalhes internos.
- Root layout passa a ser renderizado dinamicamente para que o nonce CSP gerado no middleware seja aplicado aos scripts do Next.js/React.
- Mantidas as correções de MFA, tipografia, segurança, WhatsApp e demais recursos da v9.45.
- Nenhuma migração SQL nova.
