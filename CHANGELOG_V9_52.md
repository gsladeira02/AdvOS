# AdvOS v9.52 — PWA e fluxo do WhatsApp

## WhatsApp
- Transferir uma conversa entre Atendimento e Financeiro/Jurídico não troca mais a caixa de entrada que o usuário está visualizando.
- A conversa transferida pode permanecer aberta para conferência, enquanto a lista continua na caixa de origem.
- Ao trocar de conversa, estados temporários da conversa anterior são reiniciados; o seletor de tags, menus do compositor, reações e modais não permanecem abertos.
- O seletor de tags passou a ser controlado, fecha explicitamente e mostra no máximo duas tags no cabeçalho, com contador para as demais.
- Mensagem de confirmação informa que a transferência foi concluída sem mudar a caixa atual.

## PWA / layout
- Cabeçalho redundante da página do WhatsApp é ocultado no mobile/PWA para liberar área útil.
- Navegação interna do WhatsApp vira faixa horizontal sem quebra de linha.
- Altura da central do WhatsApp foi consolidada em uma regra final, evitando sobreposição com cabeçalho e barra inferior.
- Controles da conversa e operações ficam em uma única faixa horizontal rolável no mobile.
- Área de mensagens, balões e compositor foram ajustados para telas estreitas.
- Reforço de largura mínima/overflow para impedir scroll lateral e conteúdo sob a navegação inferior.
