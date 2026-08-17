# AdvOS v9.30 — WhatsApp avançado

## Novos recursos
- Localização nativa via WhatsApp Cloud API, com geolocalização do navegador ou coordenadas manuais.
- Enquetes no AdvOS enviadas como mensagens interativas oficiais com 2 ou 3 opções.
- Eventos enviados como mensagem interativa com Confirmar / Talvez / Não posso.
- Cartões próprios de localização, enquete e evento dentro do histórico do AdvOS.
- Prévia desses tipos na lista de conversas.
- Botões de ligação e videochamada no cabeçalho da conversa.
- Integração inicial com WhatsApp Business Calling API usando WebRTC no navegador.
- Checagem de configuração e permissão de chamada antes de iniciar.
- Solicitação de permissão de chamada pelo WhatsApp quando o cliente ainda não autorizou.
- Encerramento de chamada pela Calling API.
- Webhook passa a registrar corretamente o call ID em eventos de chamada.

## Observações
- Voz/vídeo só funcionam se a Calling API estiver habilitada para o número na Meta e o webhook estiver inscrito no campo `calls`.
- Chamadas iniciadas pelo escritório exigem permissão do cliente, conforme regras da Meta.
- Para redes NAT restritivas, configure `NEXT_PUBLIC_WEBRTC_STUN_URL` com um STUN aprovado pelo escritório.
- A Cloud API não expõe um tipo nativo de enquete/evento equivalente ao app WhatsApp; o AdvOS usa mensagens interativas oficiais.
- Não há nova migração SQL nesta versão.
