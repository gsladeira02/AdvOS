# AdvOS v9.84.7.20

## Visualização interna de PDFs

- Corrigida a política CSP para permitir `blob:` em `frame-src`.
- Corrigida a política CSP para permitir `blob:` em `object-src`.
- Isso permite que o PDF carregado como Blob seja exibido dentro do modal/iframe do AdvOS, inclusive após a assinatura final.
- Mantido o documento compacto na lista de Assinaturas: o PDF só é carregado ao clicar no documento.
- Nenhuma alteração no Supabase.
