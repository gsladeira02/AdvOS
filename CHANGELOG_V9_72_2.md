# AdvOS v9.72.2

- Corrigida a exportação de conversas para não depender de colunas opcionais presentes apenas em migrations recentes.
- Exportação usa `select('*')` e trata campos opcionais de forma segura.
- Adicionada paginação de conversas e mensagens para exportações maiores.
- Erro do endpoint agora retorna `detail` técnico além da mensagem amigável.
