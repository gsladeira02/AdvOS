# AdvOS v9.60 — Filtros do WhatsApp

- Corrige o painel de filtros do WhatsApp no PWA: o painel agora é flutuante, tem rolagem própria e não comprime/corta a lista de conversas.
- Remove alturas fixas dos selects dos filtros e aumenta o line-height/padding para impedir recorte de letras no mobile.
- Adiciona filtro de tipo de contato na aba Conversas: Todos os contatos, Somente leads, Somente clientes e Sem cadastro.
- O filtro "Somente leads" considera leads ainda abertos no funil comercial, inclusive quando já foram vinculados a um cliente mas ainda não atingiram uma etapa de ganho.
- Mantém filtros existentes de responsável, tag e não lidas. Ao escolher Somente leads, libera também etapa e origem de mídia (Meta Ads/Google Ads) diretamente na aba Conversas.
- Adiciona botão explícito para fechar o painel de filtros no PWA.
- Não requer migration SQL.
