# AdvOS v9.84.7.13

- Corrige a visualização interna do documento após a assinatura do cliente.
- Preview tenta o PDF intermediário, assinaturas registradas e, por último, o documento original.
- Aceita paths antigos com prefixo `documents/` e URLs HTTP(S).
- Bloqueia confirmação/assinatura do Daniel enquanto o PDF não estiver efetivamente carregado.
- Adiciona estado de carregamento, erro e tentativa novamente no visualizador.
