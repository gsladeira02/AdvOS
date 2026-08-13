# AdvOS V9.27 — correções operacionais

## Logout

- Botão de logout disponível também no cabeçalho mobile.
- Logout executado no backend e no cliente Supabase.
- Cookies SSR de autenticação são removidos explicitamente quando necessário.
- Redirecionamento usa o domínio atual da requisição, sem depender de NEXT_PUBLIC_APP_URL.
- Caches PWA antigos do AdvOS são removidos durante a saída.

## WhatsApp

- O JWT da sessão autenticada é enviado explicitamente ao Supabase Realtime antes da inscrição nos eventos.
- O token do Realtime é atualizado quando o Supabase renova a sessão.
- Eventos de `whatsapp_conversations` e `whatsapp_messages` disparam nova leitura da API.
- Eventos recebidos durante uma leitura em andamento não são mais descartados: uma nova atualização fica enfileirada.
- Requisições de atualização possuem timeout de 10 segundos para não congelar o mecanismo automático.
- Polling de segurança permanece ativo a cada ~2 segundos em primeiro plano e ~8 segundos quando a aba está oculta.
- Contato virtual que recebe a primeira mensagem migra automaticamente para a conversa real.
- Indicador "Ao vivo" só aparece quando o canal Realtime está realmente inscrito.

## Integrações

Asaas e ZapSign não foram removidos nem alterados. Podem permanecer sem configuração e ser ativados no futuro.

## Banco

Não há migração SQL nova nesta versão.
