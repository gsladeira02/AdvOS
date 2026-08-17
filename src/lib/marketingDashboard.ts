import 'server-only';

export const LOSS_REASON_LABELS: Record<string, string> = {
  sem_resposta: 'Não respondeu',
  sem_interesse: 'Sem interesse',
  sem_condicoes_financeiras: 'Sem condições financeiras',
  caso_inviavel: 'Caso inviável',
  contratou_outro: 'Contratou outro escritório',
  fora_area: 'Fora da área de atuação',
  contato_duplicado: 'Contato duplicado',
  outro: 'Outro',
};

function n(value: any) { return Number(value || 0); }
function round1(value: number) { return Math.round(value * 10) / 10; }
function safeDate(value?: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}
function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function beginningOfPeriod(days: number | null) {
  if (!days) return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return date;
}

async function fetchPaged(builderFactory: (from: number, to: number) => any, pageSize = 1000) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFactory(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function platformKey(lead: any) {
  if (lead?.source_platform === 'meta' || lead?.source === 'meta_ads') return 'meta';
  if (lead?.source_platform === 'google' || lead?.source === 'google_ads') return 'google';
  return 'organic';
}
function platformLabel(key: string) {
  if (key === 'meta') return 'Meta Ads';
  if (key === 'google') return 'Google Ads';
  return 'Orgânico / outros';
}
function campaignLabel(lead: any) {
  return String(lead?.campaign_name || lead?.utm_campaign || lead?.campaign_id || 'Sem campanha identificada');
}
function campaignId(lead: any) {
  return String(lead?.campaign_id || lead?.utm_campaign || campaignLabel(lead));
}
function adLabel(lead: any) {
  return String(lead?.ad_name || lead?.referral_headline || lead?.ad_id || lead?.creative_id || 'Sem anúncio identificado');
}
function adId(lead: any) {
  return String(lead?.ad_id || lead?.creative_id || adLabel(lead));
}

function makeBucket(key: string, label: string) {
  return {
    key,
    label,
    leads: 0,
    qualified: 0,
    proposals: 0,
    contracted: 0,
    paidClients: 0,
    lost: 0,
    contractRevenue: 0,
    receivedRevenue: 0,
    spend: 0,
    cpl: 0,
    cpa: 0,
    roi: 0,
    roas: 0,
    conversionRate: 0,
  };
}

function finalizeBucket(bucket: any) {
  bucket.cpl = bucket.leads > 0 ? bucket.spend / bucket.leads : 0;
  bucket.cpa = bucket.contracted > 0 ? bucket.spend / bucket.contracted : 0;
  bucket.conversionRate = bucket.leads > 0 ? round1((bucket.contracted / bucket.leads) * 100) : 0;
  bucket.roas = bucket.spend > 0 ? bucket.contractRevenue / bucket.spend : 0;
  bucket.roi = bucket.spend > 0 ? ((bucket.contractRevenue - bucket.spend) / bucket.spend) * 100 : 0;
  return bucket;
}

export async function loadMarketingDashboard(admin: any, lawFirmId: string, days: number | null = 30) {
  const start = beginningOfPeriod(days);
  const startIso = start?.toISOString() || null;
  const end = new Date();
  const endDate = dateOnly(end);
  const startDate = start ? dateOnly(start) : '2000-01-01';

  const leads = await fetchPaged((from, to) => {
    let q = admin
      .from('whatsapp_leads')
      .select('id,stage,source,source_platform,source_channel,campaign_id,campaign_name,adset_id,adset_name,adgroup_id,adgroup_name,ad_id,ad_name,creative_id,utm_campaign,utm_term,referral_headline,qualification_score,qualified_automatically,qualified_at,proposal_sent_at,contracted_at,first_payment_at,lost_at,loss_reason,service_interest,converted_client_id,created_at,updated_at')
      .eq('law_firm_id', lawFirmId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (startIso) q = q.gte('created_at', startIso);
    return q;
  });

  const leadIds = leads.map((lead: any) => String(lead.id));
  const stageRows = await fetchPaged((from, to) => admin
    .from('whatsapp_lead_stages')
    .select('stage_key,name,color,sort_order,active,outcome')
    .eq('law_firm_id', lawFirmId)
    .order('sort_order')
    .range(from, to));
  const stageMap = new Map(stageRows.map((stage: any) => [String(stage.stage_key), stage]));

  let contracts: any[] = [];
  let installments: any[] = [];
  let history: any[] = [];
  if (leadIds.length) {
    for (let index = 0; index < leadIds.length; index += 150) {
      const ids = leadIds.slice(index, index + 150);
      const [{ data: contractPage, error: contractError }, { data: historyPage, error: historyError }] = await Promise.all([
        admin.from('financial_contracts').select('id,lead_id,total_amount,status,created_at').eq('law_firm_id', lawFirmId).in('lead_id', ids),
        admin.from('whatsapp_lead_stage_history').select('id,lead_id,stage_key,entered_at,exited_at,loss_reason').eq('law_firm_id', lawFirmId).in('lead_id', ids),
      ]);
      if (contractError) throw contractError;
      if (historyError) throw historyError;
      contracts.push(...(contractPage || []));
      history.push(...(historyPage || []));
    }
    const contractIds = contracts.map((row: any) => String(row.id));
    for (let index = 0; index < contractIds.length; index += 150) {
      const ids = contractIds.slice(index, index + 150);
      const { data, error } = await admin
        .from('financial_installments')
        .select('id,contract_id,amount,status,paid_at,created_at,updated_at')
        .eq('law_firm_id', lawFirmId)
        .in('contract_id', ids);
      if (error) throw error;
      installments.push(...(data || []));
    }
  }

  const spendRows = await fetchPaged((from, to) => admin
    .from('marketing_spend_entries')
    .select('id,source_platform,period_start,period_end,campaign_id,campaign_name,ad_id,ad_name,amount,notes,created_at')
    .eq('law_firm_id', lawFirmId)
    .lte('period_start', endDate)
    .gte('period_end', startDate)
    .order('period_start', { ascending: false })
    .range(from, to));

  const contractById = new Map(contracts.map((row: any) => [String(row.id), row]));
  const contractsByLead = new Map<string, any[]>();
  for (const contract of contracts) {
    const leadId = String(contract.lead_id || '');
    if (!leadId) continue;
    const current = contractsByLead.get(leadId) || [];
    current.push(contract);
    contractsByLead.set(leadId, current);
  }
  const paidByLead = new Map<string, number>();
  for (const installment of installments) {
    if (String(installment.status || '').toLowerCase() !== 'pago') continue;
    const contract = contractById.get(String(installment.contract_id || ''));
    if (!contract?.lead_id) continue;
    const leadId = String(contract.lead_id);
    paidByLead.set(leadId, (paidByLead.get(leadId) || 0) + n(installment.amount));
  }

  const platformBuckets = new Map<string, any>();
  const campaignBuckets = new Map<string, any>();
  const adBuckets = new Map<string, any>();

  function bucketForLead(map: Map<string, any>, key: string, label: string) {
    if (!map.has(key)) map.set(key, makeBucket(key, label));
    return map.get(key)!;
  }

  for (const lead of leads) {
    const pKey = platformKey(lead);
    const p = bucketForLead(platformBuckets, pKey, platformLabel(pKey));
    const cIdentity = campaignId(lead);
    const cKey = `${pKey}:${cIdentity}`;
    const c = bucketForLead(campaignBuckets, cKey, campaignLabel(lead));
    c.platform = pKey;
    c.campaignId = String(lead?.campaign_id || '');
    const aIdentity = adId(lead);
    const aKey = `${cKey}:${aIdentity}`;
    const a = bucketForLead(adBuckets, aKey, adLabel(lead));
    a.platform = pKey;
    a.campaign = campaignLabel(lead);
    a.campaignId = c.campaignId;
    a.adId = String(lead?.ad_id || lead?.creative_id || '');

    const buckets = [p, c, a];
    const outcome = String((stageMap.get(String(lead.stage)) as any)?.outcome || 'open');
    const qualified = Boolean(lead.qualified_at || lead.qualified_automatically || n(lead.qualification_score) > 0 || ['qualificado','proposta','contratado','convertido'].includes(String(lead.stage)));
    const proposed = Boolean(lead.proposal_sent_at || ['proposta'].includes(String(lead.stage)));
    const leadContracts = (contractsByLead.get(String(lead.id)) || []).filter((row: any) => !['cancelado','cancelada','inativo','inativa'].includes(String(row.status || '').toLowerCase()));
    const contracted = Boolean(lead.contracted_at || outcome === 'won' || leadContracts.length);
    const lost = outcome === 'lost';
    const received = paidByLead.get(String(lead.id)) || 0;
    const contractRevenue = leadContracts.reduce((sum: number, row: any) => sum + n(row.total_amount), 0);

    for (const bucket of buckets) {
      bucket.leads += 1;
      if (qualified) bucket.qualified += 1;
      if (proposed) bucket.proposals += 1;
      if (contracted) bucket.contracted += 1;
      if (received > 0 || lead.first_payment_at) bucket.paidClients += 1;
      if (lost) bucket.lost += 1;
      bucket.contractRevenue += contractRevenue;
      bucket.receivedRevenue += received;
    }
  }

  // Custos podem ser lançados por plataforma, campanha e/ou anúncio. Evita somar
  // uma mesma entrada em dois níveis: cada linha entra no nível mais específico e
  // sempre compõe o total da plataforma.
  let totalSpend = 0;
  for (const spend of spendRows) {
    const amount = n(spend.amount);
    totalSpend += amount;
    const pKey = String(spend.source_platform || '');
    const p = bucketForLead(platformBuckets, pKey, platformLabel(pKey));
    p.spend += amount;

    const spendCampaignId = String(spend.campaign_id || '').trim();
    const spendCampaignName = String(spend.campaign_name || '').trim();
    let matchingCampaign: any = Array.from(campaignBuckets.values()).find((row: any) => row.platform === pKey && (
      (spendCampaignId && String(row.campaignId || '') === spendCampaignId) ||
      (spendCampaignName && String(row.label || '').toLocaleLowerCase('pt-BR') === spendCampaignName.toLocaleLowerCase('pt-BR'))
    ));
    if (!matchingCampaign && (spendCampaignId || spendCampaignName)) {
      const cIdentity = spendCampaignId || spendCampaignName;
      const cKey = `${pKey}:${cIdentity}`;
      matchingCampaign = bucketForLead(campaignBuckets, cKey, spendCampaignName || spendCampaignId);
      matchingCampaign.platform = pKey;
      matchingCampaign.campaignId = spendCampaignId;
    }

    if (spend.ad_id || spend.ad_name) {
      const spendAdId = String(spend.ad_id || '').trim();
      const spendAdName = String(spend.ad_name || '').trim();
      let matchingAd: any = Array.from(adBuckets.values()).find((row: any) => row.platform === pKey && (
        (!matchingCampaign || String(row.campaign || '') === String(matchingCampaign.label || '')) &&
        ((spendAdId && String(row.adId || '') === spendAdId) || (spendAdName && String(row.label || '').toLocaleLowerCase('pt-BR') === spendAdName.toLocaleLowerCase('pt-BR')))
      ));
      if (!matchingAd) {
        const cKey = matchingCampaign?.key || `${pKey}:${spendCampaignId || spendCampaignName || 'Sem campanha identificada'}`;
        const aIdentity = spendAdId || spendAdName || 'Sem anúncio identificado';
        matchingAd = bucketForLead(adBuckets, `${cKey}:${aIdentity}`, spendAdName || spendAdId || 'Sem anúncio identificado');
        matchingAd.platform = pKey;
        matchingAd.campaign = matchingCampaign?.label || spendCampaignName || spendCampaignId || 'Sem campanha identificada';
        matchingAd.campaignId = spendCampaignId;
        matchingAd.adId = spendAdId;
      }
      matchingAd.spend += amount;
    } else if (matchingCampaign) {
      matchingCampaign.spend += amount;
    }
  }

  const lossMap = new Map<string, number>();
  for (const lead of leads) {
    const outcome = String((stageMap.get(String(lead.stage)) as any)?.outcome || 'open');
    if (outcome !== 'lost') continue;
    const key = String(lead.loss_reason || 'outro');
    lossMap.set(key, (lossMap.get(key) || 0) + 1);
  }

  const stageDurationMap = new Map<string, { seconds: number; count: number }>();
  const nowMs = Date.now();
  for (const row of history) {
    const entered = safeDate(row.entered_at);
    if (!entered) continue;
    const exited = safeDate(row.exited_at) || nowMs;
    const seconds = Math.max(0, (exited - entered) / 1000);
    const key = String(row.stage_key || '');
    if (!key) continue;
    const current = stageDurationMap.get(key) || { seconds: 0, count: 0 };
    current.seconds += seconds;
    current.count += 1;
    stageDurationMap.set(key, current);
  }

  const stagesTime = stageRows
    .map((stage: any) => {
      const values = stageDurationMap.get(String(stage.stage_key));
      if (!values?.count) return null;
      return {
        key: String(stage.stage_key),
        name: String(stage.name),
        color: String(stage.color || 'slate'),
        averageHours: round1(values.seconds / values.count / 3600),
        transitions: values.count,
      };
    })
    .filter(Boolean);

  const platform = Array.from(platformBuckets.values()).map(finalizeBucket).sort((a, b) => b.leads - a.leads || b.contractRevenue - a.contractRevenue);
  const campaigns = Array.from(campaignBuckets.values()).map(finalizeBucket).sort((a, b) => b.contractRevenue - a.contractRevenue || b.leads - a.leads).slice(0, 50);
  const ads = Array.from(adBuckets.values()).map(finalizeBucket).sort((a, b) => b.contractRevenue - a.contractRevenue || b.leads - a.leads).slice(0, 50);

  const summary = platform.reduce((acc: any, row: any) => {
    acc.leads += row.leads;
    acc.qualified += row.qualified;
    acc.proposals += row.proposals;
    acc.contracted += row.contracted;
    acc.paidClients += row.paidClients;
    acc.lost += row.lost;
    acc.contractRevenue += row.contractRevenue;
    acc.receivedRevenue += row.receivedRevenue;
    return acc;
  }, { leads: 0, qualified: 0, proposals: 0, contracted: 0, paidClients: 0, lost: 0, contractRevenue: 0, receivedRevenue: 0 });
  summary.spend = totalSpend;
  summary.cpl = summary.leads > 0 ? totalSpend / summary.leads : 0;
  summary.cpa = summary.contracted > 0 ? totalSpend / summary.contracted : 0;
  summary.conversionRate = summary.leads > 0 ? round1((summary.contracted / summary.leads) * 100) : 0;
  summary.roas = totalSpend > 0 ? summary.contractRevenue / totalSpend : 0;
  summary.roi = totalSpend > 0 ? ((summary.contractRevenue - totalSpend) / totalSpend) * 100 : 0;

  return {
    period: { days, start: startIso, end: end.toISOString() },
    summary,
    funnel: [
      { key: 'leads', label: 'Leads', count: summary.leads },
      { key: 'qualified', label: 'Qualificados', count: summary.qualified },
      { key: 'proposals', label: 'Propostas', count: summary.proposals },
      { key: 'contracted', label: 'Contratados', count: summary.contracted },
      { key: 'paid', label: 'Com pagamento', count: summary.paidClients },
    ],
    platform,
    campaigns,
    ads,
    lossReasons: Array.from(lossMap.entries()).map(([key, count]) => ({ key, label: LOSS_REASON_LABELS[key] || key.replace(/_/g, ' '), count })).sort((a, b) => b.count - a.count),
    stagesTime,
    spendEntries: spendRows,
  };
}
