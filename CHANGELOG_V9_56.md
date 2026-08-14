# AdvOS v9.56 — Respostas automáticas de WhatsApp e confirmação de envio

## Respostas automáticas para leads
- Nova seção `WhatsApp → Configurações → Respostas automáticas`.
- Gatilho **Primeiro contato de novo lead**: dispara somente quando a mensagem recebida cria um lead que ainda não é cliente.
- Gatilho opcional **Palavra-chave**: permite responder quando a mensagem contém termos cadastrados.
- Filtro opcional por caixa: Atendimento, Financeiro/Jurídico ou qualquer caixa.
- Variáveis suportadas: `{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}` e `{{escritorio}}`.
- Cada regra pode ser editada, ativada, desativada e excluída.
- Mensagens automáticas aparecem no histórico identificadas como `Resposta automática · nome da automação`.

## Proteção contra disparos duplicados
- Nova tabela `whatsapp_auto_reply_logs` reserva cada regra/conversa antes do envio.
- Restrição única impede disparos duplicados por repetição de webhook ou concorrência entre instâncias.
- O gatilho de novo lead só é elegível no evento que efetivamente criou o lead.
- Em falha real da API, a reserva é liberada para não registrar falsamente uma mensagem como enviada.

## Envio pela API no Financeiro
- O botão do modal de cobrança passa a se chamar **Enviar pela API**.
- O modal só é fechado depois de a API oficial retornar sucesso.
- Após sucesso, o AdvOS mostra confirmação explícita e, quando disponível, o ID da mensagem retornado pela Meta.
- Se houver erro, o modal permanece aberto mostrando o motivo para permitir nova tentativa.

## Banco de dados
Executar uma vez no Supabase:

`supabase/v9_56_whatsapp_auto_replies.sql`
