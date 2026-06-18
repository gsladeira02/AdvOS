# AdvOS V4

Sistema jurídico interno, desktop-first, para escritórios de advocacia.

## O que mudou na V4

- Abre direto no login.
- Sem página pública, planos ou módulos comerciais.
- Card de “Fluxo interno” removido.
- Dados do escritório e usuário ficam apenas em `/app/configuracoes`.
- Aba `/app/integracoes` com ZapSign e Asaas.
- Nova aba `/app/contratos` para gerar contrato de honorários e procurações.
- Formulário de contratos baseado na aba `Dados Contrato` da planilha do escritório.
- Modelos disponíveis:
  - contrato de honorários;
  - procuração sem hipossuficiência econômica;
  - procuração com declaração de hipossuficiência econômica;
  - kit contrato + procuração sem hipossuficiência;
  - kit contrato + procuração com hipossuficiência.
- Geração de arquivo Word editável `.doc` diretamente pelo navegador.
- Histórico de documentos gerados em `generated_contracts`.
- Sem `package-lock.json`.

## Instalação nova

1. Crie o projeto no Supabase.
2. Rode `supabase/schema.sql` no SQL Editor.
3. Crie o primeiro usuário em `Authentication > Users`.
4. Configure as variáveis na Vercel.
5. Faça deploy.
6. Entre no AdvOS e vá em Configurações para criar o escritório/perfil inicial.

## Atualização de V3 para V4

Se você já rodou o schema da V3, rode apenas:

```sql
-- arquivo: supabase/v4_migration.sql
```

Depois substitua os arquivos no GitHub e faça redeploy na Vercel.

## Atualização de V1/V2 para V4

Rode primeiro:

```sql
-- arquivo: supabase/v3_migration.sql
```

Depois rode:

```sql
-- arquivo: supabase/v4_migration.sql
```

Em seguida substitua os arquivos no GitHub e faça redeploy na Vercel.

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

## Como usar contratos e procurações

1. Vá em `Contratos`.
2. Escolha o tipo de documento.
3. Preencha os dados do autor/contratante.
4. Preencha os honorários quando for contrato ou kit.
5. Clique em `Gerar arquivo Word`.
6. O navegador baixa um arquivo `.doc` editável.

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
