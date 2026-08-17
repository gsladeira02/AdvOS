# AdvOS v9.59 — Mensagens + Financeiro por cliente

## WhatsApp
- Nova ação **Apagar para mim**: oculta a mensagem somente para o usuário logado.
- Nova ação **Apagar para todos**: remove a mensagem para todos os usuários do AdvOS.
- Exclusões para todos são propagadas às telas abertas pelo polling da conversa.
- A interface informa a limitação da WhatsApp Cloud API: o AdvOS não afirma que a mensagem foi removida retroativamente do aparelho do cliente.
- A limpeza completa da conversa continua disponível separadamente.

## Financeiro
- Campo persistente `payment_method` em `financial_installments`.
- Formas: Pix, boleto, cartão de crédito, cartão de débito, transferência, dinheiro, cliente escolhe e outro.
- Backfill automático da forma de pagamento a partir de `billing_type` do Asaas quando possível.
- Forma de pagamento editável diretamente na tabela do Financeiro.
- Exclusão de cobrança diretamente no Financeiro, com confirmação.
- Quando uma cobrança manual era a última de um contrato financeiro sem documento gerado, o contrato vazio também é removido.
- Cobranças do Asaas são removidas somente do AdvOS; a exclusão local não cancela automaticamente a cobrança externa.

## Clientes
- Nova seção **Financeiro do cliente** na pasta individual.
- Cadastro de cobrança sem sair da ficha do cliente.
- Definição de valor, vencimento, status e forma de pagamento.
- Lista consolidada de todas as cobranças vinculadas ao cliente, inclusive manuais e importadas.
- Forma de pagamento editável e cobrança excluível na própria ficha.

## Integração Asaas
- Novas cobranças criadas/atualizadas pelo Asaas passam a preencher também `payment_method` a partir do `billing_type`.
- Importações do Asaas também preenchem a forma de pagamento quando identificável.

## Migration
Execute `supabase/v9_59_financeiro_exclusao_mensagens.sql` antes do deploy.
