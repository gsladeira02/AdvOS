# AdvOS v9.36

## WhatsApp — Encerrados

- Adicionada a área **Encerrados** no menu principal do WhatsApp.
- Botão **Encerrar** disponível em conversas ativas.
- Conversas encerradas preservam todo o histórico e podem ser reabertas.
- **Reabrir atendimento** devolve a conversa ao setor de origem (Atendimento ou Financeiro/Jurídico).
- Nova mensagem recebida reabre automaticamente um atendimento encerrado.
- Enquanto encerrada, a conversa fica somente para consulta; envio de mensagens e chamadas é bloqueado até a reabertura.
- Dashboard diferencia conversas ativas de encerradas.
- Migração SQL: `supabase/v9_36_whatsapp_encerrados.sql`.
