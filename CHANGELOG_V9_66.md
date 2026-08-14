# AdvOS v9.66 — Transcrição gratuita no navegador

- Remove dependência de OpenAI/Groq para transcrição de áudios do WhatsApp.
- Transcrição executada localmente no navegador desktop com Transformers.js + Whisper Base multilíngue.
- Modelo é baixado apenas no primeiro uso e reaproveitado do cache do navegador.
- Processamento ocorre em Web Worker para não bloquear a interface do WhatsApp.
- O áudio não é enviado para serviço externo de IA; somente o texto final é salvo no AdvOS.
- Mantém cache da transcrição no banco para não processar o mesmo áudio novamente.
- Botão de transcrição oculto no PWA/standalone e protegido também por verificação em JavaScript.
- Tela Integrações não solicita mais OpenAI API Key para transcrição.
- Runtime ONNX/WASM servido pelo próprio domínio do AdvOS após o postinstall; nenhum código executável é carregado de CDN.
- CSP libera apenas WebAssembly (`wasm-unsafe-eval`) e os hosts de arquivos de modelo do Hugging Face.
- Atualiza cache do PWA para v9.66.
- Sem nova migration SQL: reutiliza os campos de transcrição já criados na v9.64.
