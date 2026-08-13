import 'server-only';

function startOfDayIso(daysBack = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (daysBack) date.setDate(date.getDate() - daysBack);
  return date.toISOString();
}

export async function loadWhatsappDashboard(admin: any, lawFirmId: string) {
  const [{ data: leads, error: leadsError }, { data: conversations, error: conversationsError }, { data: stages, error: stagesError }, { data: tagLinks, error: tagLinksError }] = await Promise.all([
    admin
      .from('whatsapp_leads')
      .select('id,stage,created_at,updated_at,converted_at,last_contact_at')
      .eq('law_firm_id', lawFirmId),
    admin
      .from('whatsapp_conversations')
      .select('id,department,unread_count,last_message_at,closed_at')
      .eq('law_firm_id', lawFirmId),
    admin
      .from('whatsapp_lead_stages')
      .select('stage_key,name,color,sort_order,active,outcome')
      .eq('law_firm_id', lawFirmId)
      .order('sort_order'),
    admin
      .from('whatsapp_conversation_tags')
      .select('tag_id, whatsapp_tags(id,name,color,active)')
      .eq('law_firm_id', lawFirmId),
  ]);

  if (leadsError) throw new Error(leadsError.message);
  if (conversationsError) throw new Error(conversationsError.message);
  if (stagesError) throw new Error(stagesError.message);
  if (tagLinksError) throw new Error(tagLinksError.message);

  const leadRows = leads || [];
  const stageRows = stages || [];
  const stageMap = new Map(stageRows.map((stage: any) => [String(stage.stage_key), stage]));
  const openLeads = leadRows.filter((lead: any) => (stageMap.get(String(lead.stage)) as any)?.outcome !== 'won' && (stageMap.get(String(lead.stage)) as any)?.outcome !== 'lost');
  const wonLeads = leadRows.filter((lead: any) => (stageMap.get(String(lead.stage)) as any)?.outcome === 'won' || lead.stage === 'convertido');
  const lostLeads = leadRows.filter((lead: any) => (stageMap.get(String(lead.stage)) as any)?.outcome === 'lost' || lead.stage === 'perdido');
  const today = startOfDayIso(0);
  const last30 = startOfDayIso(29);

  const byStage = stageRows.map((stage: any) => ({
    key: String(stage.stage_key),
    name: String(stage.name),
    color: String(stage.color || 'slate'),
    outcome: String(stage.outcome || 'open'),
    active: stage.active !== false,
    count: leadRows.filter((lead: any) => String(lead.stage) === String(stage.stage_key)).length,
  }));

  const unknownStageKeys: string[] = Array.from(new Set<string>(leadRows.map((lead: any) => String(lead.stage || '')).filter((key: string) => Boolean(key) && !stageMap.has(key))));
  for (const key of unknownStageKeys) {
    byStage.push({ key, name: key.replace(/_/g, ' '), color: 'slate', outcome: 'open', active: false, count: leadRows.filter((lead: any) => String(lead.stage) === key).length });
  }

  const conversationRows = conversations || [];
  const activeConversationRows = conversationRows.filter((conversation: any) => !conversation.closed_at);
  const closedConversationRows = conversationRows.filter((conversation: any) => Boolean(conversation.closed_at));
  const unreadConversations = activeConversationRows.filter((conversation: any) => Number(conversation.unread_count || 0) > 0);
  const decisionBase = wonLeads.length + lostLeads.length;

  const tagCounts = new Map<string, { id: string; name: string; color: string; count: number }>();
  for (const link of tagLinks || []) {
    const tag: any = Array.isArray((link as any).whatsapp_tags) ? (link as any).whatsapp_tags[0] : (link as any).whatsapp_tags;
    if (!tag?.id || tag.active === false) continue;
    const key = String(tag.id);
    const existing = tagCounts.get(key) || { id: key, name: String(tag.name || 'Tag'), color: String(tag.color || 'slate'), count: 0 };
    existing.count += 1;
    tagCounts.set(key, existing);
  }

  return {
    generatedAt: new Date().toISOString(),
    leads: {
      total: leadRows.length,
      open: openLeads.length,
      newToday: leadRows.filter((lead: any) => String(lead.created_at || '') >= today).length,
      new30d: leadRows.filter((lead: any) => String(lead.created_at || '') >= last30).length,
      converted: wonLeads.length,
      converted30d: wonLeads.filter((lead: any) => String(lead.converted_at || lead.updated_at || '') >= last30).length,
      lost: lostLeads.length,
      conversionRate: decisionBase ? Math.round((wonLeads.length / decisionBase) * 1000) / 10 : 0,
      byStage,
    },
    conversations: {
      total: activeConversationRows.length,
      totalWithClosed: conversationRows.length,
      atendimento: activeConversationRows.filter((conversation: any) => (conversation.department || 'atendimento') === 'atendimento').length,
      financeiroJuridico: activeConversationRows.filter((conversation: any) => conversation.department === 'financeiro_juridico').length,
      closed: closedConversationRows.length,
      unreadConversations: unreadConversations.length,
      unreadMessages: unreadConversations.reduce((sum: number, conversation: any) => sum + Number(conversation.unread_count || 0), 0),
    },
    tags: Array.from(tagCounts.values()).sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
