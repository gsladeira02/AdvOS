# AdvOS v9.63 — Transcrição de áudios do WhatsApp

## WhatsApp
- Adicionada ação **Transcrever áudio** diretamente nas mensagens de voz.
- A transcrição aparece abaixo do player e fica salva no histórico da mensagem.
- Áudios já transcritos não são processados novamente ao reabrir a conversa.
- Estado de processamento, sucesso e erro é sincronizado pelos próprios registros de `whatsapp_messages`.
- Mensagens de voz OGG/Opus são preparadas no navegador para MP3 antes da transcrição quando necessário, sem alterar o arquivo original armazenado.
- Limite de 25 MB por áudio para acompanhar o limite do endpoint de transcrição.
- Rate limit por usuário para evitar disparos acidentais em massa.

## Integrações
- Nova configuração **Integrações → Transcrição de áudios**.
- Chave da OpenAI fica apenas no backend/`integration_settings`; nunca é enviada ao cliente.
- Suporte a `OPENAI_API_KEY` e `OPENAI_API_BASE_URL` por variável de ambiente.
- Modelo padrão: `gpt-transcribe`.
- Opção econômica: `gpt-4o-mini-transcribe`.
- Português (`pt`) é enviado como idioma esperado e há contexto jurídico para melhorar nomes, datas, valores e números falados.

## Banco de dados
Execute uma vez:

`supabase/v9_63_whatsapp_transcricao_audio.sql`

A migration adiciona os campos de texto, status, modelo, erro, data e usuário responsável pela transcrição em `whatsapp_messages`.
