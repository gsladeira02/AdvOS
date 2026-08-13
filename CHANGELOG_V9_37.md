# AdvOS v9.37 — Operação do WhatsApp

## Responsáveis
- Cada conversa real pode ter um responsável do escritório.
- Ações: Sem responsável, selecionar usuário ativo e Assumir para mim.
- O responsável aparece na lista de conversas.

## Filtros
- Minhas conversas.
- Sem responsável.
- Usuário responsável.
- Tag.
- Etapa do lead.
- Somente não lidas.

## Notas internas
- Notas vinculadas à conversa, visíveis apenas no AdvOS.
- Autor e data/hora registrados.
- Autor pode excluir a própria nota; administrador também pode excluir.
- Notas nunca são enviadas à Meta/WhatsApp.

## Histórico operacional
- Registro de atribuição de responsável, transferências, tags, atualização de lead, conversão, encerramento e reabertura.

## Autoria das mensagens
- Mensagens enviadas exibem o usuário do escritório que realizou o envio.
- Mensagens antigas sem `sent_by` não recebem autoria inventada e aparecem como “Escritório · histórico”.

## Banco
Executar `supabase/v9_37_whatsapp_responsaveis_notas_filtros.sql` antes do deploy. A migração é aditiva.
