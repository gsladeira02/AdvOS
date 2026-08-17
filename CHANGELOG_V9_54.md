# AdvOS v9.54

## Documentos mais leves

- Adicionada otimização automática antes de gravar arquivos no bucket privado `documents`.
- PDFs são regravados com estrutura otimizada quando o resultado fica menor.
- JPG/JPEG, PNG e WebP passam por recompressão e, em imagens muito grandes, redução proporcional de resolução.
- DOCX, XLSX e PPTX são recompactados como contêineres Office e o resultado só substitui o original quando realmente reduz o tamanho.
- ZIP também é recompactado quando houver ganho real.
- Formatos nos quais uma alteração poderia corromper conteúdo ou causar perda relevante são mantidos intactos.
- Nunca é armazenada uma versão otimizada maior que o original, exceto quando o usuário escolhe explicitamente converter para PDF.

## Converter para PDF no upload

- Cada arquivo compatível possui a opção **Converter para PDF** antes do envio.
- Adicionado atalho **Converter compatíveis para PDF** para seleção em lote.
- Conversão segura nesta versão: JPG/JPEG, PNG, WebP, TXT, CSV, XLS e XLSX.
- DOC/DOCX e PPT/PPTX permanecem no formato original para preservar integralmente formatação, assinaturas, campos e elementos jurídicos.
- Imagens convertidas para PDF são normalizadas e comprimidas antes de serem incorporadas.
- TXT/CSV e planilhas são convertidos para PDF paginado e otimizado.

## Todos os fluxos de armazenamento

A otimização foi centralizada em `src/lib/documentOptimization.ts` e aplicada em:

1. upload manual para a Pasta do Cliente;
2. mídia recebida pelo WhatsApp e salva automaticamente;
3. documentos/mídias enviados pelo WhatsApp que ficam armazenados no AdvOS;
4. PDFs de contratos/documentos gerados pelo próprio AdvOS.

## Feedback no upload

- A tela informa que a compactação automática está ativa.
- Após o envio, mostra quantos arquivos foram otimizados, quantos foram convertidos para PDF e quantos bytes foram economizados.
- As notas internas do documento registram tamanho original, tamanho armazenado e estratégia de otimização para os uploads manuais.

## Dependências

- `sharp@0.33.5` para otimização de imagens.
- `fflate@0.8.2` para recompactação segura de contêineres Office/ZIP.
- `pdf-lib` e `xlsx` já existentes continuam sendo usados para PDF e planilhas.
