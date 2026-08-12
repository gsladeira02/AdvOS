# AdvOS V7

Sistema jurídico interno, desktop-first, com login direto, geração de PDF, ZapSign, Asaas, WhatsApp e pasta em nuvem por cliente.

## Principais mudanças da V7

- O usuário consegue acessar as abas mesmo sem preencher os dados cadastrais do escritório.
- No primeiro login, o AdvOS cria automaticamente um escritório provisório chamado **Escritório sem cadastro**.
- Os dados do escritório podem ser completados depois em **Configurações**.
- A lista de clientes agora abre uma **pasta do cliente**.
- A pasta do cliente mostra documentos gerados, documentos enviados manualmente, processos vinculados e contratos gerados.
- A pasta do cliente permite upload de arquivos para o Supabase Storage privado.
- Dentro da pasta de cada cliente é possível gerar PDF de contrato/procuração, enviar para ZapSign, criar cobranças no Asaas e preparar botão de WhatsApp.
- O botão de WhatsApp usa o número cadastrado no cliente e envia mensagem com link da ZapSign e links das cobranças Asaas.

## Instalação para quem já está na V5

1. Substitua os arquivos do GitHub por esta versão.
2. Rode no Supabase:

```sql
supabase/v6_migration.sql
```

3. Faça redeploy na Vercel.
4. Entre no sistema normalmente.

## Instalação nova

1. Crie projeto no Supabase.
2. Rode `supabase/schema.sql`.
3. Crie o primeiro usuário em `Authentication > Users`.
4. Configure as variáveis na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

5. Suba o projeto no GitHub e faça deploy na Vercel.
6. Entre com o usuário criado no Supabase Auth.
7. Complete os dados do escritório depois em `/app/configuracoes` quando quiser.

## Observações

- O ZIP não inclui `package-lock.json`.
- O bucket `documents` é privado.
- Os arquivos da pasta do cliente são abertos por signed URL gerada no servidor.
- Para ZapSign e Asaas funcionarem, configure as chaves em `/app/integracoes`.


## AdvOS V8

- Aba Documentos removida do menu lateral; documentos ficam dentro da pasta do cliente.
- Nova aba Serviços para cadastrar serviços jurídicos do escritório.
- Cada cliente pode ter um serviço prestado vinculado.
- O serviço vinculado é usado como base no objeto do contrato e no valor padrão da cobrança.
- Para atualizar da V7, rode `supabase/v8_migration.sql`.

## AdvOS V8.3 - Asaas

Esta versão reforça a integração com o Asaas:

- Configuração da API Key em `/app/integracoes`.
- Teste de conexão com o Asaas.
- Criação automática de webhook do Asaas.
- Validação do header `asaas-access-token` no webhook.
- Criação/atualização de cobranças sem duplicar parcelas já integradas.
- Botão para gerar/atualizar cobranças Asaas diretamente na pasta do cliente.
- Links de cobrança ficam disponíveis para envio por WhatsApp.

Após atualizar os arquivos, rode no Supabase:

```sql
-- supabase/v8_3_asaas_integration.sql
```

Depois configure em `/app/integracoes`:

1. Ambiente: Sandbox ou Produção.
2. API Key do Asaas.
3. Tipo padrão: Boleto, Pix ou Cliente escolhe.
4. Token de segurança do webhook.
5. Salvar Asaas.
6. Testar conexão.
7. Criar webhook no Asaas.


## V8.4 - Importação inicial do Asaas

Esta versão adiciona uma tela para importar clientes e cobranças exportados do Asaas em CSV/XLSX.

1. Rode no Supabase: `supabase/v8_4_asaas_initial_import.sql`.
2. Faça redeploy na Vercel.
3. Acesse `Integrações > Asaas > Importação inicial`.
4. Envie o arquivo exportado do Asaas.
5. O AdvOS cruza cliente por ID Asaas, CPF/CNPJ, e-mail, telefone e nome.

A importação cria clientes faltantes, vincula `asaas_customer_id`, cria cobranças no financeiro e evita duplicidade quando encontrar ID externo de cobrança.

## V9.2 - WhatsApp Cloud API oficial

Esta versão adiciona integração direta com a API oficial da Meta/WhatsApp:

- nova aba `WhatsApp` no menu lateral;
- configuração em `Integrações > WhatsApp API`;
- envio de mensagem pela API dentro do Financeiro;
- fallback para abrir WhatsApp Web;
- webhook em `/api/webhooks/whatsapp` para receber mensagens e status;
- conversas salvas no Supabase e vinculadas ao cliente pelo telefone/WhatsApp.

Após atualizar os arquivos, rode no Supabase:

```sql
-- supabase/v9_2_whatsapp_api.sql
```

Depois configure em `/app/integracoes`:

1. Ative a integração WhatsApp.
2. Cole o Access Token permanente da Meta.
3. Informe o Phone Number ID.
4. Informe o WABA ID, se tiver.
5. Informe o número oficial.
6. Crie e salve o Verify Token.
7. Teste a conexão.
8. Configure na Meta o webhook: `NEXT_PUBLIC_APP_URL/api/webhooks/whatsapp`.
9. Assine o campo `messages` no painel da Meta.

Observação: mensagens livres pela API funcionam dentro da janela de atendimento de 24h. Fora da janela, a Meta pode exigir template oficial aprovado.
