# AdvOS v9.80.4

## Correção do envio do link de assinatura pelo WhatsApp
- O botão de envio agora garante/recupera uma solicitação de assinatura nativa do AdvOS antes de enviar a mensagem.
- Se o documento já possui solicitação válida, reutiliza o token do cliente.
- Se não possui, cria automaticamente cliente + Daniel Costa Ladeira como signatários 1 e 2.
- Gera o link `/assinar/<token>` e o envia pela API oficial do WhatsApp.
- Não depende de `zapsign_url` legado.
- Não envia mensagem sem um link válido.
