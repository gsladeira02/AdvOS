# AdvOS v9.61 — filtro por mensagens lidas e não lidas

## WhatsApp
- Substituído o filtro binário “Somente não lidas” por um filtro completo de status de leitura.
- Novas opções: **Todas as mensagens**, **Lidas** e **Não lidas**.
- O filtro usa `unread_count`: conversas com zero mensagens pendentes entram em **Lidas**; conversas com uma ou mais mensagens pendentes entram em **Não lidas**.
- O filtro pode ser combinado com tipo de contato, leads, etapa, origem Meta/Google, responsável e tags.
- O contador de filtros ativos considera o status de leitura quando diferente de “Todas”.
- “Limpar filtros” também restaura o status de leitura para “Todas as mensagens”.
- Mantido o painel com rolagem própria no PWA para evitar cortes.

## Banco de dados
- Nenhuma migration nova é necessária.
