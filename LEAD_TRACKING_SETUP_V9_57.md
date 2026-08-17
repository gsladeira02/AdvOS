# Configuração do rastreamento de leads — AdvOS v9.57

## 1. Supabase
Execute primeiro:

`supabase/v9_57_lead_attribution_meta_google.sql`

## 2. Meta Ads
Para anúncios Click-to-WhatsApp, não é necessário alterar a URL do anúncio. O AdvOS lê automaticamente os dados `referral` enviados pelo webhook oficial do WhatsApp.

Quando disponíveis, ficam registrados: ID/origem do anúncio, headline, texto do anúncio, URL de origem e `ctwa_clid`.

## 3. Google Ads
1. Acesse **WhatsApp → Configurações → Rastreamento** no AdvOS.
2. Copie a **URL de rastreamento com ValueTrack**.
3. Use essa URL como destino do anúncio/campanha cujo objetivo final é abrir o WhatsApp.
4. Mantenha a marcação automática do Google Ads ativa para que o GCLID seja acrescentado quando aplicável.
5. O AdvOS registra o clique e redireciona para o WhatsApp com uma referência única `ADV-...` na mensagem pré-preenchida.
6. Quando a primeira mensagem chega, o AdvOS vincula o clique ao lead e remove a referência técnica do texto exibido na conversa.

A URL gerada inclui campanha, grupo de anúncios, criativo/anúncio, palavra-chave, tipo de correspondência, rede e dispositivo por ValueTrack. Também são armazenados `gclid`, `gbraid` ou `wbraid` quando enviados pelo Google.

## 4. Resultado no atendimento
O lead rastreado recebe:
- Origem: Meta Ads ou Google Ads;
- Etapa Qualificado (quando a opção automática estiver ativa);
- Score de qualificação;
- Área jurídica provável;
- Campanha;
- Grupo/conjunto de anúncios quando disponível;
- Anúncio/criativo;
- Palavra-chave/termo quando disponível;
- ID do clique para atribuição futura de conversões.
