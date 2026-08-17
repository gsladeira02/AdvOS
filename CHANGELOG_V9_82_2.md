# AdvOS v9.82.2

## Contrato e assinatura eletrônica
- Reformatado o gerador de documentos oficiais Ladeira com tipografia jurídica, margens, cabeçalho, rodapé, logo e hierarquia de cláusulas.
- Removida a página de assinatura vazia do documento gerado; as assinaturas passam a ser anexadas somente no documento assinado.
- O PDF assinado agora é reconstruído a partir do documento original, evitando acumular páginas de certificados de etapas anteriores.
- Adicionada página visual de registro de assinaturas com nome, papel, e-mail, telefone, método, data/hora, IP quando disponível e status.
- Selfie do cliente é incorporada ao relatório de assinaturas quando disponível.
- Foto de Daniel é usada quando disponível na conta; fallback para a identidade visual do escritório.
- Assinaturas eletrônicas aparecem como bloco visual tipográfico, sem desenho manual.
- O certificado de evidências registra o hash SHA-256 do documento original e as evidências de autenticação.
- O documento final continua separado do original no Storage.

## Segurança e fluxo
- Cliente continua obrigado a visualizar o documento antes de assinar.
- Daniel continua assinando apenas dentro do AdvOS, sem token público e sem OTP.
- Nenhuma das assinaturas exige assinatura manual.
