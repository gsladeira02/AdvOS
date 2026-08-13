# AdvOS V9.31

Base: V9.29 + recursos avançados de WhatsApp.

## WhatsApp V9.30
- Localização nativa (coordenadas atuais ou manuais).
- Enquete por mensagem interativa oficial (2–3 opções).
- Evento por mensagem interativa oficial (Confirmar / Talvez / Não posso).
- Cartões desses recursos no histórico e prévias na lista de conversas.
- Ligação e videochamada via WhatsApp Business Calling API quando habilitada para o número.
- Solicitação de permissão de chamada ao cliente.
- Fallback para ligação telefônica comum.

## Calling API
Para voz/vídeo no navegador, a Meta precisa habilitar WhatsApp Business Calling para o número e o webhook do aplicativo deve estar inscrito no campo `calls`.

Em redes onde o navegador não consegue negociar ICE diretamente, configure opcionalmente:

`NEXT_PUBLIC_WEBRTC_STUN_URL=stun:seu-servidor-stun:3478`

Use apenas um servidor STUN aprovado pelo escritório.

## Banco
Não existe SQL novo obrigatório para a V9.30.


## V9.31 — correção de origem/Calling
- Corrige o bloqueio `Origem inválida.` em contextos que enviam `Origin: null`.
- Mantém bloqueio de requisições `cross-site`.
- `Origin: null` só é aceito com `Sec-Fetch-Site: same-origin` ou `Referer` do próprio AdvOS.
- Comparação de origem passa a considerar `x-forwarded-host` / `x-forwarded-proto` na Vercel.
- Nenhum SQL novo.
