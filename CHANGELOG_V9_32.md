# AdvOS v9.32

## WhatsApp — Atendimento + Financeiro/Jurídico

- Divide a Central do WhatsApp em **Atendimento** e **Financeiro/Jurídico**.
- Conversas podem ser transferidas entre os dois setores sem perder histórico.
- Novas conversas entram por padrão em Atendimento.

## Leads

- Número desconhecido que envia mensagem vira **lead**, nunca cliente automaticamente.
- Funil: Novo, Em atendimento, Qualificado, Proposta, Aguardando e Perdido.
- Tela de detalhes do lead com nome, e-mail, interesse/área jurídica e observações.
- Botão **Cadastrar como cliente** com confirmação manual.
- Na conversão, o AdvOS evita cliente duplicado por telefone e vincula o histórico existente.
- Mídias antigas do lead são vinculadas à Pasta do Cliente quando ele é convertido.

## Tags

- Tags livres por conversa, com adição e remoção no próprio atendimento.
- Tags aparecem na lista de conversas e entram na pesquisa.

## Mídias na Pasta do Cliente

- Foto, áudio, vídeo, figurinha ou documento recebido de cliente já vinculado entra automaticamente em **Pasta do Cliente**.
- O arquivo não é duplicado no Storage: a Pasta do Cliente referencia o mesmo objeto recebido pelo WhatsApp.
- Reprocessamentos de webhook não criam documentos duplicados.
- A migração também vincula mídias históricas que já estavam associadas a clientes.

## Banco

Executar antes do deploy:

`supabase/v9_32_whatsapp_atendimento_leads_tags.sql`
