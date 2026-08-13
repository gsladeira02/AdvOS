# AdvOS v9.28 — WhatsApp: conversas recebidas e seleção neutra

## Corrigido

- A aba **Conversas** passa a ser derivada das mensagens realmente visíveis (`deleted_at is null`), sem depender apenas de `last_message_at`.
- Mensagens recebidas pelo webhook atualizam a conversa com o horário real da mensagem e falhas na atualização do metadado deixam de ser ignoradas.
- Nenhuma conversa ou contato é aberto automaticamente ao entrar no WhatsApp.
- O polling não marca mais a primeira conversa como lida sem o usuário abri-la.
- `Esc` fecha a conversa atual e retorna ao estado sem conversa selecionada.
- O cabeçalho da conversa ganhou controle explícito para fechar: seta no mobile e X no desktop.
- Respostas antigas de polling não conseguem reabrir uma conversa depois de o usuário fechá-la.
- No mobile, o estado sem conversa selecionada exibe somente a lista; o painel vazio fica reservado ao desktop.

## Banco

- Nenhuma migração SQL nova é necessária para esta versão.
