# AdvOS V1

Sistema jurídico interno, desktop-first, para escritório familiar de advocacia.

## Stack
- Next.js App Router
- Supabase Auth
- Supabase Database
- Supabase Storage-ready
- Tailwind CSS

## Como subir
1. Crie um projeto no Supabase.
2. Rode o SQL em `supabase/schema.sql` no SQL Editor.
3. Em Authentication > Users, crie o primeiro usuário manualmente.
4. Copie o `id` do usuário criado.
5. No SQL, insira um `law_firm`, uma `subscription` e um `profile` usando o `auth_user_id` do usuário.
6. Configure as variáveis `.env` na Vercel.
7. Suba no GitHub e faça deploy na Vercel.

## Regra da V1
Todos os usuários internos possuem o mesmo nível de acesso. O primeiro usuário é criado no Supabase. Depois disso, qualquer usuário ativo do escritório pode criar outros usuários dentro do painel.
