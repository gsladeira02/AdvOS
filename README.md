# AdvOS v9.49

Sistema interno de gestão do escritório com clientes, processos, prazos, tarefas, documentos, contratos, serviços, financeiro e central de WhatsApp.

## Autenticação
- Login normal por e-mail e senha.
- Usuário precisa estar cadastrado e ativo no AdvOS.
- Não há MFA/TOTP obrigatório.
- Sessão, auditoria, RLS, rate limiting e demais hardenings de segurança permanecem ativos.

## Painel geral
O painel principal em `/app/dashboard` consolida indicadores do escritório, incluindo leads, serviços, financeiro, processos, prazos e tarefas. O Dashboard não fica mais dentro do WhatsApp.

## Financeiro
Os status apresentados ao usuário são:
- Aguardando pagamento (`pendente`)
- Em atraso (`atrasado`)
- Pagamento recebido (`pago`)

O status pode ser alterado diretamente na tabela financeira.

## WhatsApp
A central mantém Atendimento, Financeiro/Jurídico, Encerrados e Configurações. Leads, tags, responsáveis, notas internas, histórico operacional e vínculo de mídia ao cliente continuam disponíveis.

Localizações são enviadas pela mensagem nativa de localização da WhatsApp Cloud API e ficam visualizáveis no histórico do AdvOS. O mapa interno usa somente `www.openstreetmap.org` como origem de frame permitida pela CSP.

## Migrações
A v9.49 não adiciona migration de banco. Para instalações vindas de versões antigas, mantenha as migrations anteriores aplicadas, inclusive a v9.48 quando o MFA obrigatório tiver sido removido.
