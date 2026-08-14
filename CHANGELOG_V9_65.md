# AdvOS V9.65 — ativação e diagnóstico da transcrição

- Corrige o reconhecimento da configuração OpenAI usada pela transcrição de áudios.
- Uma `OPENAI_API_KEY` configurada na Vercel passa a funcionar mesmo quando ainda não existe registro OpenAI no banco.
- Ao informar uma nova API Key pela tela de Integrações, a transcrição é ativada automaticamente.
- O cartão de Transcrição de áudios diferencia: sem chave, desativada, configurada, via Vercel e ativa/testada.
- Adiciona o botão **Testar transcrição**, que valida a chave e o endpoint real de transcrição antes do uso no WhatsApp.
- Mostra diagnósticos específicos para chave inválida, falta de permissão, modelo indisponível, falta de créditos, rate limit, timeout e falha geral.
- Corrige os hints de idioma por modelo: `gpt-transcribe` usa `languages[]=pt`; modelos GPT-4o Transcribe usam `language=pt`.
- Aumenta o limite do middleware para a rota de transcrição, permitindo arquivos até o limite de 25 MB da API.
- Atualiza o cache do PWA para v9.65.

Não há migration SQL nova nesta versão. A migration v9.64 continua sendo a necessária para as colunas de transcrição.
