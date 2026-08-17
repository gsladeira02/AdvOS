# AdvOS v9.58 — Comercial + Marketing

## Funil comercial
- Mantém o lead no funil mesmo depois de vinculá-lo a um cliente, até que seja contratado ou perdido.
- Etapa padrão `Contratado` adicionada; `Proposta` passa a aparecer como `Proposta enviada`.
- Registro automático dos marcos: qualificação, proposta, contratação, primeiro pagamento e perda.
- Histórico de permanência por etapa para medir tempo médio do funil.
- Ao mover para uma etapa de perda, o motivo passa a ser obrigatório: não respondeu, sem interesse, sem condições financeiras, caso inviável, contratou outro escritório, fora da área, duplicado ou outro.
- O histórico da conversa registra mudança de etapa e motivo da perda.

## Receita atribuída ao anúncio
- `financial_contracts` e `generated_contracts` passam a ser ligados automaticamente ao lead que originou o cliente.
- A criação de contrato financeiro marca o lead como `Contratado` automaticamente, salvo quando ele estiver explicitamente perdido.
- O primeiro pagamento recebido é registrado no lead.
- Contratos e pagamentos existentes são vinculados/backfilled quando houver um lead convertido correspondente.

## Marketing & Comercial
- Nova área `/app/marketing`, disponível na navegação desktop e em “Mais áreas” no PWA, preservando as cinco abas inferiores do PWA.
- Indicadores de leads, qualificados, propostas, contratados, clientes com pagamento, receita contratada e receita recebida.
- Comparação por Meta Ads, Google Ads e orgânico/outros.
- Ranking de campanhas e anúncios/criativos por contratos, conversão e receita.
- Motivos de perda e tempo médio por etapa.
- Filtros de 7, 30, 90, 365 dias e todo o período.

## Custos e retorno
- Administradores podem registrar investimento por plataforma, campanha ou anúncio.
- Cálculo de CPL, CPA, ROI e ROAS a partir do custo informado e da receita efetivamente atribuída.
- A tabela `marketing_spend_entries` foi desenhada para receber futuramente sincronização automática das APIs de anúncios sem alterar o dashboard.

## Painel geral
- Resumo de Marketing & Comercial incluído no Início com leads, contratos, receita e retorno dos últimos 30 dias.

## Banco de dados
Execute uma vez antes do deploy:

`supabase/v9_58_comercial_marketing.sql`

## Ajustes finais
- O atalho `Abrir leads` do painel Marketing abre diretamente a aba de leads da Central do WhatsApp.
- O lançamento de investimento aceita valores no padrão brasileiro (`1.234,56`) e decimal com ponto (`1234.56`).
- A barra inferior do PWA permanece limitada a Início, Clientes, Prazos, Financeiro e WhatsApp.
