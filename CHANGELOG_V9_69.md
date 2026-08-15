# AdvOS v9.69

## WhatsApp — encaminhamento de múltiplas mensagens

- O botão Encaminhar agora entra em modo de seleção de mensagens.
- É possível selecionar várias mensagens recebidas da mesma conversa.
- O contador de mensagens selecionadas aparece no cabeçalho do modo de seleção.
- A seleção pode ser cancelada a qualquer momento.
- Depois de selecionar, o usuário escolhe uma única conversa de destino entre todas as conversas disponíveis no WhatsApp.
- O encaminhamento preserva a ordem cronológica das mensagens selecionadas.
- Textos e mídias são encaminhados em sequência para o destino.
- A API de encaminhamento aceita `messageIds` e mantém compatibilidade com `messageId` único.
- Apenas mensagens recebidas podem ser encaminhadas, preservando a regra anterior do AdvOS.
- Durante o modo de seleção, ações de reação/exclusão ficam ocultas para evitar cliques acidentais.
- O modo de seleção é encerrado automaticamente ao trocar de conversa.
- Não requer nova migration SQL.
