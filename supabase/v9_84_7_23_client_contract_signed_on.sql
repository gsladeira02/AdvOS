-- ADV-OS: campo opcional de data da assinatura do contrato na ficha do cliente.
-- Execute uma única vez; não altera os registros existentes.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contract_signed_on date;
COMMENT ON COLUMN public.clients.contract_signed_on IS
  'Data da assinatura do contrato informada na ficha do cliente (preenchimento manual).';
