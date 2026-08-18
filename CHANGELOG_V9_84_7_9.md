# AdvOS v9.84.7.9

Correção da rota de selfie: removido `has_document` de `signature_events`, pois essa coluna não existe no schema atual. A informação continua em `metadata` e o documento permanece salvo em `signature_signers.document_photo_path`.
