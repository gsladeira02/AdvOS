# AdvOS v9.57 — Leads qualificados + atribuição Meta Ads e Google Ads

## Qualificação automática
- Leads identificados como mídia paga podem entrar automaticamente na etapa **Qualificado**.
- Score de qualificação de 0 a 100 com motivos registrados no lead.
- Inferência inicial da área jurídica a partir do anúncio e da primeira mensagem (Trabalhista, Previdenciário, Família, Inventário, Consumidor, Criminal, Empresarial, Imobiliário, Tributário e Cível/Contratos).
- A configuração pode ser ativada/desativada em **WhatsApp → Configurações → Rastreamento**.

## Meta Ads
- O webhook do WhatsApp passa a ler o objeto `referral` de anúncios Click-to-WhatsApp.
- Salva no lead, quando enviados pela Meta: ID/origem do anúncio, headline, body, URL de origem e `ctwa_clid`.
- Lead recebe origem `Meta Ads` e badge de aquisição na lista/conversa.

## Google Ads
- Novo endpoint público `/r/whatsapp` para atribuir o clique antes de abrir o WhatsApp.
- A tela **Rastreamento** gera a URL pronta com parâmetros ValueTrack:
  - `{campaignid}`
  - `{adgroupid}`
  - `{creative}`
  - `{keyword}`
  - `{matchtype}`
  - `{network}`
  - `{device}`
- O endpoint também captura automaticamente `gclid`, `gbraid` e `wbraid` quando presentes.
- Cada clique recebe uma referência `ADV-...`; a referência acompanha a mensagem pré-preenchida e é vinculada ao lead no primeiro contato.
- A referência técnica é removida do texto exibido na conversa, permanecendo apenas nos dados de rastreamento.

## Atendimento
- Card de aquisição no topo da conversa mostra plataforma, score, área jurídica, campanha, grupo/conjunto, anúncio/criativo, termo e identificador do clique.
- Modal **Detalhes do lead** mostra a ficha de aquisição.
- Lista de leads mostra badges **Meta Ads** / **Google Ads**, score e área provável.
- Pesquisa passa a localizar leads por origem, campanha, anúncio e termo.
- Novo filtro de origem: Meta Ads / Google Ads.

## Banco de dados
Execute uma vez:

`supabase/v9_57_lead_attribution_meta_google.sql`

A migration adiciona os campos de atribuição em `whatsapp_leads` e cria `lead_tracking_settings` e `lead_tracking_clicks`.
