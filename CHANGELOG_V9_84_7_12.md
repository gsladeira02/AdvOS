# AdvOS v9.84.7.12

## Correção da visualização do documento após assinatura do cliente

- A rota interna de preview agora prioriza `signature_requests.final_document_path`.
- Quando o cliente já assinou, o escritório visualiza o PDF intermediário gerado após a assinatura do cliente.
- Quando ainda não existe PDF intermediário, a rota usa o documento original vinculado à solicitação.
- O preview continua protegido pela sessão do escritório e pelo `law_firm_id`.
- O botão "Abrir documento em nova janela" usa a mesma rota corrigida.
- Não requer alteração no schema do Supabase.
