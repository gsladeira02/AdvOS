# AdvOS v9.84.1

- Hotfix da página pública de assinatura.
- O link do cliente agora é resolvido exclusivamente por `signature_requests.public_token`.
- Removida a dependência da coluna `signature_signers.signer_token` na renderização inicial da página.
- A página pública usa apenas colunas existentes desde a migration v9.76.
- Erros de banco/configuração não derrubam mais a página com exceção server-side; são exibidos como mensagem amigável.
- O token público continua sendo o token utilizado pelos endpoints de visualização/assinatura do cliente.
