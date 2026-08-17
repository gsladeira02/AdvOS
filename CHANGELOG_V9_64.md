# AdvOS V9.64 — Hotfix de transcrição de áudios

- Corrige falha genérica na transcrição e passa a informar a causa real ao usuário.
- Detecta migration ausente/Schema Cache do Supabase e orienta qual SQL executar.
- Envia `language=pt` para compatibilidade com todos os modelos suportados.
- Adiciona `gpt-4o-transcribe` às opções de modelo.
- Diferencia erros de API Key, permissão de modelo, cota/faturamento, limite, formato e timeout.
- Mensagens OGG/Opus do WhatsApp são preparadas como WAV mono 16 kHz antes da transcrição.
- MP3, MP4/M4A, WAV e WebM compatíveis são enviados sem recodificação desnecessária.
- Corrige validação segura de arquivos WebM no backend.
