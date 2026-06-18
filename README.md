# AdvOS V3

Sistema jurídico interno, desktop-first, para escritórios de advocacia.

## O que mudou na V3

- Abre direto no login.
- Sem página pública, planos ou módulos comerciais.
- Card de “Fluxo interno” removido.
- Dados do escritório e usuário ficam apenas em `/app/configuracoes`.
- Nova aba `/app/integracoes`.
- Integração opcional com ZapSign para assinatura digital.
- Integração opcional com Asaas para gerar cobranças.
- Webhooks prontos para ZapSign e Asaas.
- Sem `package-lock.json`.

## Instalação nova

1. Crie o projeto no Supabase.
2. Rode `supabase/schema.sql` no SQL Editor.
3. Crie o primeiro usuário em `Authentication > Users`.
4. Configure as variáveis na Vercel.
5. Faça deploy.
6. Entre no AdvOS e vá em Configurações para criar o escritório/perfil inicial.

## Atualização de V1/V2 para V3

Se você já rodou o schema antigo, rode apenas:

```sql
-- arquivo: supabase/v3_migration.sql
```

Depois substitua os arquivos no GitHub e faça redeploy na Vercel.

## Variáveis obrigatórias

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

## Variáveis opcionais

Você pode salvar as chaves pela aba Integrações dentro do AdvOS. Se preferir usar env na Vercel:

```env
ZAPSIGN_API_TOKEN=
ZAPSIGN_API_BASE_URL=https://api.zapsign.com.br/api/v1
ASAAS_API_KEY=
ASAAS_API_BASE_URL=https://api-sandbox.asaas.com/v3
```

## Webhooks

Configure nos painéis externos:

```text
ZapSign: https://SEU-DOMINIO/api/webhooks/zapsign
Asaas:   https://SEU-DOMINIO/api/webhooks/asaas
```

## Como usar ZapSign

1. Vá em Integrações e salve o token da ZapSign.
2. Vá em Documentos.
3. Cadastre um documento com link público de PDF.
4. Clique em Enviar para assinatura.

## Como usar Asaas

1. Vá em Integrações e salve a API Key do Asaas.
2. Cadastre um cliente com CPF/CNPJ, e-mail e telefone.
3. Vá em Financeiro.
4. Cadastre uma cobrança.
5. Clique em Gerar Asaas.

