# AdvOS v9.25 — revisão de layout

Revisão visual sobre a v9.24, sem alteração de banco de dados ou regras de negócio.

## Correções principais
- Campo de pesquisa do WhatsApp: ícone e texto agora têm áreas independentes; a lupa não sobrepõe o placeholder.
- Campo de busca de Modelos de mensagem: aplicada a mesma correção preventiva.
- Cabeçalho de páginas no mobile: títulos longos e botões deixam de ser forçados para a mesma linha em telas estreitas.
- Painéis de emoji e figurinhas do WhatsApp: passam a abrir dentro da largura disponível da tela.
- Compositor do WhatsApp em celulares estreitos: botões e espaçamento reduzidos de forma segura.
- Botão flutuante de novas mensagens: limitado à largura da conversa no mobile.
- Ícones dentro de botões: impedidos de encolher/desalinhar.
- Textos longos em cards e painéis: quebra segura para evitar overflow horizontal.
- Navegação inferior mobile: rótulos protegidos contra estouro de largura.
- Inputs de arquivo: largura limitada ao container.

## Validação
- 78 arquivos TypeScript/TSX analisados pelo parser do TypeScript.
- 0 erros de sintaxe encontrados.
- Nenhum SQL novo é necessário para esta revisão.
