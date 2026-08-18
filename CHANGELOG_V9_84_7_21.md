# AdvOS v9.84.7.21

## Assinatura — validação de selfie
- Validação da selfie agora exige exatamente um rosto detectado antes de aceitar a imagem.
- Usa a Shape Detection API quando disponível e MediaPipe Face Detector como fallback multiplataforma.
- Selfies sem rosto ou com mais de um rosto são rejeitadas e não ficam armazenadas como selfie válida.
- Não há validação de brilho, iluminação ou desfoque.
- Nenhuma informação de detecção de rosto é adicionada ao documento final.

## Documento de assinatura
- Removidas do PDF as mensagens “A assinatura é eletrônica. Nenhuma assinatura manual foi exigida.”
- Mantida apenas a identificação necessária da assinatura/evidências.
- Horários exibidos no certificado e nas evidências passam a usar explicitamente o fuso `America/Sao_Paulo` (GMT-3).

## Segurança / compatibilidade
- Adicionado `@mediapipe/tasks-vision` 1.0.1 para fallback de detecção de rosto no navegador.
- CSP permite apenas os endpoints necessários para carregar o runtime WASM e o modelo de detecção do MediaPipe.
