import 'server-only';

export type LeadAttribution = {
  source: 'meta_ads' | 'google_ads';
  source_platform: 'meta' | 'google';
  source_channel: 'paid_social' | 'paid_search';
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  adgroup_id?: string | null;
  adgroup_name?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  creative_id?: string | null;
  click_id?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  source_url?: string | null;
  referral_headline?: string | null;
  referral_body?: string | null;
  raw?: Record<string, any>;
  tracking_click_id?: string | null;
};

function clean(value: any, max = 500) {
  const text = String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function first(...values: any[]) {
  for (const value of values) {
    const result = clean(value);
    if (result) return result;
  }
  return null;
}

export function metaAttributionFromMessage(message: any): LeadAttribution | null {
  const referral = message?.referral;
  if (!referral || typeof referral !== 'object') return null;

  const adId = first(referral.source_id, referral.ad_id);
  const headline = first(referral.headline);
  const body = first(referral.body);
  const sourceUrl = first(referral.source_url);
  const clickId = first(referral.ctwa_clid);
  if (!adId && !headline && !body && !sourceUrl && !clickId) return null;

  return {
    source: 'meta_ads',
    source_platform: 'meta',
    source_channel: 'paid_social',
    ad_id: adId,
    ad_name: headline,
    click_id: clickId,
    source_url: sourceUrl,
    referral_headline: headline,
    referral_body: body,
    utm_source: 'meta',
    utm_medium: 'paid_social',
    raw: referral,
  };
}

export function trackingReferenceFromText(text?: string | null) {
  const source = String(text || '');
  const match = source.match(/(?:^|\s)(?:ref(?:er[eê]ncia)?\s*[:#-]?\s*)?ADV-([A-Z0-9]{10,24})(?=\s|$|[.,;!?])/i);
  return match?.[1] ? String(match[1]).toUpperCase() : null;
}

export function stripTrackingReference(text?: string | null) {
  const source = String(text || '');
  return source
    .replace(/\s*(?:\n|^)?\s*(?:ref(?:er[eê]ncia)?\s*[:#-]?\s*)?ADV-[A-Z0-9]{10,24}\s*/ig, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function googleAttributionFromInboundText(admin: any, lawFirmId: string, text?: string | null): Promise<LeadAttribution | null> {
  const publicRef = trackingReferenceFromText(text);
  if (!publicRef) return null;

  const { data, error } = await admin
    .from('lead_tracking_clicks')
    .select('*')
    .eq('law_firm_id', lawFirmId)
    .eq('provider', 'google_ads')
    .eq('public_ref', publicRef)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    const code = String(error.code || '');
    if (code === '42P01' || code === 'PGRST205') return null;
    throw new Error(error.message);
  }
  if (!data?.id) return null;

  return {
    source: 'google_ads',
    source_platform: 'google',
    source_channel: 'paid_search',
    campaign_id: clean(data.campaign_id),
    campaign_name: clean(data.campaign_name),
    adgroup_id: clean(data.adgroup_id),
    adgroup_name: clean(data.adgroup_name),
    ad_id: clean(data.ad_id || data.creative_id),
    ad_name: clean(data.ad_name),
    creative_id: clean(data.creative_id),
    click_id: first(data.gclid, data.gbraid, data.wbraid),
    gclid: clean(data.gclid),
    gbraid: clean(data.gbraid),
    wbraid: clean(data.wbraid),
    utm_source: first(data.utm_source, 'google'),
    utm_medium: first(data.utm_medium, 'cpc'),
    utm_campaign: clean(data.utm_campaign),
    utm_content: clean(data.utm_content),
    utm_term: first(data.utm_term, data.keyword),
    raw: data.raw_params || {},
    tracking_click_id: String(data.id),
  };
}

const LEGAL_INTERESTS: Array<[string, RegExp]> = [
  ['Trabalhista', /\b(trabalh|demiss|rescis|fgts|hora extra|ass[eé]dio|emprego|empregad)/i],
  ['Previdenciário', /\b(inss|aposent|benef[ií]cio|aux[ií]lio|bpc|loas|previden)/i],
  ['Família', /\b(div[oó]rci|guarda|pens[aã]o|alimentos|fam[ií]lia|uni[aã]o est[aá]vel)/i],
  ['Sucessões / Inventário', /\b(invent[aá]rio|heran[cç]a|testamento|sucess)/i],
  ['Consumidor', /\b(consumidor|cobran[cç]a indevida|negativ|serasa|produto|servi[cç]o defeit)/i],
  ['Criminal', /\b(criminal|pris[aã]o|delegacia|inquérito|crime|audi[eê]ncia de cust[oó]dia)/i],
  ['Empresarial', /\b(empres|societ[aá]ri|cnpj|contrato empresarial|s[oó]cio)/i],
  ['Imobiliário', /\b(im[oó]vel|aluguel|loca[cç][aã]o|condom[ií]nio|usucapi|posse)/i],
  ['Tributário', /\b(tribut|imposto|execu[cç][aã]o fiscal|d[ií]vida ativa|icms|iss|irpf)/i],
  ['Cível / Contratos', /\b(contrato|indeniza[cç][aã]o|danos morais|c[ií]vel|obriga[cç][aã]o)/i],
];

export function inferLegalInterest(...parts: Array<string | null | undefined>) {
  const haystack = parts.filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [label, pattern] of LEGAL_INTERESTS) {
    if (pattern.test(haystack)) return label;
  }
  return null;
}

export function qualifyPaidLead(input: { attribution?: LeadAttribution | null; message?: string | null; name?: string | null }) {
  const attribution = input.attribution || null;
  if (!attribution) return { qualified: false, score: 0, reasons: [] as string[], serviceInterest: inferLegalInterest(input.message) };

  const reasons: string[] = [];
  let score = 55;
  reasons.push(attribution.source_platform === 'meta' ? 'Origem identificada: Meta Ads' : 'Origem identificada: Google Ads');
  if (attribution.campaign_id || attribution.utm_campaign) { score += 10; reasons.push('Campanha identificada'); }
  if (attribution.ad_id || attribution.creative_id || attribution.referral_headline) { score += 15; reasons.push('Anúncio/criativo identificado'); }
  if (attribution.click_id || attribution.gclid || attribution.gbraid || attribution.wbraid) { score += 10; reasons.push('Clique rastreável'); }

  const serviceInterest = inferLegalInterest(
    input.message,
    attribution.referral_headline,
    attribution.referral_body,
    attribution.ad_name,
    attribution.utm_campaign,
    attribution.utm_content,
    attribution.utm_term,
  );
  if (serviceInterest) { score += 5; reasons.push(`Área provável: ${serviceInterest}`); }
  if (String(input.name || '').trim()) score += 5;

  return { qualified: true, score: Math.min(100, score), reasons, serviceInterest };
}

export async function markTrackingClickMatched(admin: any, attribution: LeadAttribution | null | undefined, input: { lawFirmId: string; conversationId: string; leadId?: string | null }) {
  if (!attribution?.tracking_click_id) return;
  const { error } = await admin
    .from('lead_tracking_clicks')
    .update({
      matched_conversation_id: input.conversationId,
      matched_lead_id: input.leadId || null,
      matched_at: new Date().toISOString(),
    })
    .eq('law_firm_id', input.lawFirmId)
    .eq('id', attribution.tracking_click_id);
  if (error && !['42P01', 'PGRST205'].includes(String(error.code || ''))) console.error('Falha ao vincular clique do Google ao lead:', error.message);
}
