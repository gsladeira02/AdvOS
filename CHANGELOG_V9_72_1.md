# AdvOS v9.72.1

## Correção da exportação de conversas
- Corrigida falha no endpoint de exportação causada pela leitura de `sent_by_name`, coluna inexistente em `whatsapp_messages`.
- O nome do remetente enviado pelo escritório agora é resolvido pela tabela `profiles`.
- Mensagens continuam incluindo revogações/remotes deletions quando disponíveis.
- Melhoradas mensagens internas de erro do exportador para facilitar diagnóstico.
- Nenhuma migration nova é necessária.
