-- Execuções judiciais: naturalidade deve ser preenchida e confirmada, nunca deduzida pelo endereço.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS naturalidade text;
COMMENT ON COLUMN public.clients.naturalidade IS 'Cidade e UF da naturalidade declarada pelo cliente para qualificação jurídica.';
