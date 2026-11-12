ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contract_total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS contract_installment_count integer;

COMMENT ON COLUMN public.clients.contract_total_amount IS
  'Valor total do contrato conforme planilha Dados Contrato; não altera cobranças';
COMMENT ON COLUMN public.clients.contract_installment_count IS
  'Quantidade de parcelas pactuadas; não equivale à quantidade de cobranças existentes';
