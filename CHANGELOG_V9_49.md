# AdvOS v9.49

## Painel geral
- Remove o Dashboard de dentro da central do WhatsApp.
- Amplia `/app/dashboard` para ser o painel executivo do escritório.
- Adiciona indicadores de leads em aberto, valores a receber, recebidos no mês, valores em atraso, clientes, serviços ativos, processos ativos e mensagens não lidas.
- Adiciona gráfico do funil de leads por etapa.
- Adiciona gráfico de serviços mais contratados por quantidade de clientes vinculados.
- Adiciona gráfico de recebimentos dos últimos seis meses e resumo da carteira atual.
- Mantém próximos prazos e tarefas pendentes no painel geral.

## Financeiro
- O status de cada cobrança pode ser alterado diretamente na tabela financeira.
- Status disponíveis na interface: `Aguardando pagamento`, `Em atraso` e `Pagamento recebido`.
- Mantém compatibilidade com os valores internos existentes: `pendente`, `atrasado` e `pago`.
- Ao marcar como pagamento recebido, `paid_at` é preenchido automaticamente com a data atual (se ainda não houver uma data).
- Ao voltar a cobrança para aguardando/em atraso, `paid_at` é removido.
- Alterações de status passam pelo backend e geram evento de auditoria.
- Cobranças manuais marcadas como pagas já são criadas com `paid_at`.

## Localização no WhatsApp
- Mantém o envio pela mensagem nativa `location` da WhatsApp Cloud API.
- Adiciona prévia em mapa antes de enviar a localização.
- Adiciona cartão persistente no histórico do AdvOS com opção `Ver no AdvOS` e `Abrir no mapa`.
- Corrige o webhook de status da Meta para não sobrescrever o `raw_payload` original da mensagem ao receber `sent/delivered/read`.
- Com isso, latitude, longitude, nome e endereço das localizações continuam disponíveis depois que a mensagem é entregue ou lida.
- Localizações recebidas de clientes também podem ser abertas pelo mesmo cartão.
- A CSP libera frames somente do OpenStreetMap para a visualização interna do mapa.

## Banco de dados
- Nenhuma migration nova é necessária para a v9.49; foram reutilizados os campos existentes `financial_installments.status`, `financial_installments.paid_at` e `whatsapp_messages.raw_payload`.
