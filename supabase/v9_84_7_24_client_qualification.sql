-- ADV-OS: informações pessoais persistentes para documentos jurídicos.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS civil_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rg_uf text;
