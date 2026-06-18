-- AdvOS V6 migration
-- Rode este arquivo se você já está usando a V5.
-- A V6 usa a estrutura existente de documentos, clientes, contratos gerados e financeiro.
-- Este arquivo apenas garante que o bucket privado de documentos exista.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- A partir da V6, o primeiro acesso cria automaticamente um escritório provisório
-- se o usuário ainda não tiver perfil. Não é mais necessário preencher os dados
-- cadastrais para acessar as abas do sistema.
