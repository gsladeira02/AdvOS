# AdvOS v9.84.7.16

## Assinaturas e visualização
- A aba Assinaturas agora exibe apenas o nome do documento e o cliente por padrão.
- A visualização do PDF é carregada somente ao clicar no item.
- O PDF é carregado via `fetch` + Blob URL para evitar a tela de conexão recusada do visualizador PDF do navegador.
- A mesma estratégia foi aplicada à tela de assinatura interna de Daniel Costa Ladeira.
- Ações de abrir e baixar ficam disponíveis somente após o PDF carregar.

## Contratos
- O CONTRATADO passou a ser exibido como `DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA`.
- Corrigida a qualificação do contratado para usar CNPJ, sem a redação incorreta de “inscrita na OAB sob o CNPJ”.
- Cabeçalho, rodapé, margens, espaçamento e tamanhos tipográficos do PDF foram reorganizados para reduzir sobreposição e melhorar a leitura.
- A seção de assinaturas foi separada do texto final para reduzir risco de quebra visual entre páginas.
