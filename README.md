# AdvOS V1

Sistema jurídico interno, desktop-first, para escritórios de advocacia.

## Fluxo desta versão

- Não existe cadastro público aberto.
- O primeiro usuário é criado manualmente no Supabase Auth.
- Depois do primeiro login, o próprio site abre a tela `/configuracao-inicial`.
- Nessa tela você define o escritório, dados do usuário inicial e período de acesso.
- Depois disso, os demais usuários são criados dentro do painel em `/app/usuarios`.
- Na V1, todos os usuários têm o mesmo nível de acesso: `membro`.

## Instalação

1. Crie o projeto no Supabase.
2. Rode `supabase/schema.sql` no SQL Editor.
3. Configure as variáveis de ambiente da `.env.example` na Vercel.
4. Crie o primeiro usuário em Authentication > Users.
5. Faça login no AdvOS com esse usuário.
6. Preencha a tela de configuração inicial.
7. Entre no painel e crie os outros usuários pelo menu Usuários.

## Variáveis de ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

A `SUPABASE_SERVICE_ROLE_KEY` é necessária para criar usuários internos e salvar a configuração inicial. Ela deve ficar somente no servidor/Vercel, nunca exposta no navegador.

## Módulos incluídos

- Dashboard
- Clientes
- Processos
- Prazos
- Documentos
- Financeiro
- Tarefas
- Usuários
- Configurações

## Observação

A integração com ZapSign ficou preparada na estrutura do banco, mas a chamada real da API deve entrar em uma V2.
