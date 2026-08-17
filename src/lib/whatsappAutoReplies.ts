import 'server-only';
import { sendWhatsAppText } from '@/lib/whatsappApi';

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function renderVariables(message: string, values: Record<string, string>) {
  return String(message || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => values[String(key || '').toLowerCase()] ?? '');
}

function ruleMatches(rule: any, input: { inboundText?: string | null; department?: string | null; isNewLead?: boolean }) {
  const department = String(rule?.department || '').trim();
  if (department && department !== String(input.department || 'atendimento')) return false;

  if (rule?.trigger_type === 'keyword') {
    const text = normalizeText(input.inboundText);
    const keywords = Array.isArray(rule?.keywords) ? rule.keywords : [];
    if (!text || !keywords.length) return false;
    return keywords.some((keyword: any) => {
      const normalized = normalizeText(keyword).trim();
      return normalized && text.includes(normalized);
    });
  }

  return rule?.trigger_type === 'new_lead' && input.isNewLead === true;
}

export async function sendLeadAutoReplies(admin: any, input: {
  lawFirmId: string;
  conversationId: string;
  phone: string;
  leadName?: string | null;
  inboundText?: string | null;
  inboundMessageId?: string | null;
  department?: string | null;
  isNewLead?: boolean;
}) {
  const { data: rules, error: rulesError } = await admin
    .from('whatsapp_auto_replies')
    .select('id,name,trigger_type,message,keywords,department,active,sort_order')
    .eq('law_firm_id', input.lawFirmId)
    .eq('active', true)
    .order('sort_order')
    .order('created_at');

  if (rulesError) {
    // Ambientes que ainda não executaram a migration v9.56 continuam recebendo
    // mensagens normalmente; apenas a automação fica inativa até o SQL ser rodado.
    if (['42P01', 'PGRST205'].includes(String(rulesError.code || '')) || String(rulesError.message || '').toLowerCase().includes('does not exist') || String(rulesError.message || '').toLowerCase().includes('schema cache')) return [];
    throw new Error(rulesError.message);
  }

  const { data: firm } = await admin
    .from('law_firms')
    .select('name')
    .eq('id', input.lawFirmId)
    .maybeSingle();

  const leadName = String(input.leadName || '').trim();
  const values = {
    nome: leadName || 'cliente',
    primeiro_nome: leadName.split(/\s+/)[0] || 'cliente',
    telefone: String(input.phone || ''),
    escritorio: String(firm?.name || 'escritório'),
  };

  const sent: any[] = [];
  for (const rule of rules || []) {
    if (!ruleMatches(rule, input)) continue;

    // Reserva idempotente: uma mesma regra nunca dispara duas vezes para a mesma
    // conversa, mesmo se a Meta repetir o webhook ou houver duas instâncias simultâneas.
    const { data: log, error: reserveError } = await admin
      .from('whatsapp_auto_reply_logs')
      .insert({
        law_firm_id: input.lawFirmId,
        rule_id: rule.id,
        conversation_id: input.conversationId,
        inbound_message_id: input.inboundMessageId || null,
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (reserveError) {
      if (String(reserveError.code || '') === '23505') continue;
      if (String(reserveError.code || '') === '42P01') return sent;
      throw new Error(reserveError.message);
    }

    try {
      const body = renderVariables(rule.message, values).trim();
      if (!body) throw new Error('Resposta automática vazia após aplicar as variáveis.');
      const result = await sendWhatsAppText({
        lawFirmId: input.lawFirmId,
        to: input.phone,
        message: body,
        clientId: null,
        sentBy: null,
        automation: { ruleId: String(rule.id), ruleName: String(rule.name || 'Resposta automática') },
      });
      await admin
        .from('whatsapp_auto_reply_logs')
        .update({ status: 'sent', outbound_message_id: result?.message?.id || null, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', log.id)
        .eq('law_firm_id', input.lawFirmId);
      sent.push({ ruleId: rule.id, messageId: result?.message?.id || null });
    } catch (error: any) {
      // Se o envio falhou, liberamos a reserva para que a próxima mensagem do lead
      // possa tentar novamente depois de a integração ser corrigida.
      await admin.from('whatsapp_auto_reply_logs').delete().eq('id', log.id).eq('law_firm_id', input.lawFirmId);
      console.error('Falha em resposta automática do WhatsApp:', error?.message || error);
    }
  }

  return sent;
}
