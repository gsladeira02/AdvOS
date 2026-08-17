# AdvOS v9.53

- Corrige estado ativo duplicado de **Integrações** ao abrir **Importar Asaas**.
- Importação Asaas passa a consultar também `import_key` antes de inserir cobrança.
- Reimportar a mesma planilha atualiza a cobrança existente em vez de criar outra.
- Nova limpeza administrativa de duplicações do Asaas na própria tela de importação.
- Limpeza financeira usa somente `external_id`/`import_key`; clientes só são mesclados por ID Asaas ou CPF/CNPJ iguais.
- Clientes com conversa do WhatsApp vinculada são preservados automaticamente na limpeza para evitar conflito de histórico.
- Migração `supabase/v9_53_asaas_dedupe.sql` remove duplicações fortes e cria índices únicos para impedir recorrência no banco.
- Ajustes tipográficos no PWA, sidebar, cabeçalhos, botões, badges e tabelas para impedir letras/descendentes cortados.
