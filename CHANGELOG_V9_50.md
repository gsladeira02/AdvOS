# AdvOS v9.50

## Financeiro

- Removido o filtro sintético **Em aberto**.
- O filtro de status passa a ser multisseleção: é possível combinar **Em atraso**, **Aguardando pagamento** e **Pagamento recebido**.
- A tela continua abrindo com **Em atraso** selecionado por padrão.
- Nenhum status selecionado equivale a visualizar todos os status.
- Paginação da tabela financeira com 10, 25, 50 ou 100 linhas por página; padrão de 25.
- Alterar filtros ou ordenação retorna automaticamente para a primeira página.

## Clientes

- Paginação da tabela de clientes com 10, 25, 50 ou 100 linhas por página; padrão de 25.
- Busca, filtros e ordenação continuam funcionando antes da paginação.
- Alterar qualquer filtro retorna à primeira página.

## Outras listagens

- Processos, Prazos, Tarefas, Serviços, Usuários, Segurança e histórico de importações do Asaas agora usam paginação na própria consulta ao Supabase.
- Nessas telas, apenas a faixa da página atual é buscada no banco, reduzindo a quantidade de registros retornados em cada carregamento.
- Seletor de 10, 25, 50 ou 100 linhas por página, com 25 como padrão.
- Modelos de mensagens também receberam paginação local com o mesmo padrão.

## Banco de dados

- Nenhuma migration nova é necessária para a v9.50.
