import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { attachConversationMediaToClientFolder } from '@/lib/whatsappCRM';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LEAD_STAGES = new Set(['novo','em_atendimento','qualificado','proposta','aguardando','convertido','perdido']);
const DEPARTMENTS = new Set(['atendimento','financeiro_juridico']);

function text(value: any, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanTag(value: any) {
  return text(value, 28)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[#\s]+/, '')
    .trim();
}

async function loadConversation(admin: any, lawFirmId: string, conversationId: string) {
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .select('*, clients(id,name,phone,whatsapp,email,doc)')
    .eq('law_firm_id', lawFirmId)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Conversa não encontrada.');
  return data;
}

async function loadLead(admin: any, lawFirmId: string, conversationId: string) {
  const { data, error } = await admin
    .from('whatsapp_leads')
    .select('*')
    .eq('law_firm_id', lawFirmId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function findClientByPhone(admin: any, lawFirmId: string, phone: string) {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) return null;
  const { data, error } = await admin
    .from('clients')
    .select('id,name,phone,whatsapp,email,doc')
    .eq('law_firm_id', lawFirmId)
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data || []).find((client: any) => {
    return normalizeBrazilPhone(client?.whatsapp) === normalized || normalizeBrazilPhone(client?.phone) === normalized;
  }) || null;
}

export async function POST(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const body = await req.json().catch(() => ({}));
    const action = text(body?.action, 50);
    const conversationId = text(body?.conversationId, 80);
    if (!conversationId) return NextResponse.json({ ok: false, error: 'Conversa inválida.' }, { status: 400 });

    const conversation = await loadConversation(admin, profile.law_firm_id, conversationId);

    if (action === 'set_department') {
      const department = text(body?.department, 40);
      if (!DEPARTMENTS.has(department)) return NextResponse.json({ ok: false, error: 'Setor inválido.' }, { status: 400 });
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({ department, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, department });
    }

    if (action === 'add_tag' || action === 'remove_tag') {
      const tag = cleanTag(body?.tag);
      if (!tag) return NextResponse.json({ ok: false, error: 'Informe uma tag.' }, { status: 400 });
      const current = Array.isArray(conversation.tags) ? conversation.tags.map((item: any) => cleanTag(item)).filter(Boolean) : [];
      let tags = current;
      if (action === 'add_tag') {
        if (!current.some((item: string) => item.toLocaleLowerCase('pt-BR') === tag.toLocaleLowerCase('pt-BR'))) tags = [...current, tag].slice(0, 12);
      } else {
        tags = current.filter((item: string) => item.toLocaleLowerCase('pt-BR') !== tag.toLocaleLowerCase('pt-BR'));
      }
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({ tags, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, tags });
    }

    if (action === 'update_lead') {
      if (conversation.client_id) return NextResponse.json({ ok: false, error: 'Essa conversa já pertence a um cliente.' }, { status: 400 });
      const stage = text(body?.stage, 40);
      if (!LEAD_STAGES.has(stage) || stage === 'convertido') return NextResponse.json({ ok: false, error: 'Etapa do lead inválida.' }, { status: 400 });
      const lead = await loadLead(admin, profile.law_firm_id, conversationId);
      if (!lead) return NextResponse.json({ ok: false, error: 'Lead não encontrado.' }, { status: 404 });
      const updates: any = { stage, updated_at: new Date().toISOString() };
      if (body?.name !== undefined) updates.name = text(body.name, 160) || null;
      if (body?.email !== undefined) updates.email = text(body.email, 180) || null;
      if (body?.serviceInterest !== undefined) updates.service_interest = text(body.serviceInterest, 180) || null;
      if (body?.notes !== undefined) updates.notes = text(body.notes, 3000) || null;
      const { data, error } = await admin
        .from('whatsapp_leads')
        .update(updates)
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', lead.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      if (updates.name) {
        await admin
          .from('whatsapp_conversations')
          .update({ lead_name: updates.name, updated_at: new Date().toISOString() })
          .eq('law_firm_id', profile.law_firm_id)
          .eq('id', conversationId);
      }
      return NextResponse.json({ ok: true, lead: data });
    }

    if (action === 'convert_to_client') {
      if (conversation.client_id) return NextResponse.json({ ok: true, clientId: conversation.client_id, alreadyClient: true });
      const lead = await loadLead(admin, profile.law_firm_id, conversationId);
      const phone = normalizeBrazilPhone(conversation.phone || lead?.phone || '');
      const name = text(body?.name || lead?.name || conversation.lead_name || phone, 180);
      if (!name) return NextResponse.json({ ok: false, error: 'Informe o nome do cliente.' }, { status: 400 });

      let client = await findClientByPhone(admin, profile.law_firm_id, phone);
      let created = false;
      if (!client) {
        const { data, error } = await admin
          .from('clients')
          .insert({
            law_firm_id: profile.law_firm_id,
            name,
            whatsapp: phone || null,
            phone: phone || null,
            email: text(body?.email || lead?.email, 180) || null,
            doc: text(body?.doc, 80) || null,
            notes: text(body?.notes || lead?.notes, 3000) || null,
          })
          .select('id,name,phone,whatsapp,email,doc')
          .single();
        if (error) throw new Error(error.message);
        client = data;
        created = true;
      }

      const now = new Date().toISOString();
      const { error: conversationError } = await admin
        .from('whatsapp_conversations')
        .update({
          client_id: client.id,
          lead_name: client.name,
          updated_at: now,
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (conversationError) throw new Error(conversationError.message);

      await admin
        .from('whatsapp_messages')
        .update({ client_id: client.id, updated_at: now })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId);

      if (lead?.id) {
        await admin
          .from('whatsapp_leads')
          .update({
            stage: 'convertido',
            converted_client_id: client.id,
            converted_at: now,
            updated_at: now,
          })
          .eq('law_firm_id', profile.law_firm_id)
          .eq('id', lead.id);
      }

      const attachedMedia = await attachConversationMediaToClientFolder(admin, {
        lawFirmId: profile.law_firm_id,
        conversationId,
        clientId: client.id,
      });

      return NextResponse.json({ ok: true, clientId: client.id, created, attachedMedia });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro ao gerenciar conversa do WhatsApp:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Não foi possível atualizar a conversa.' }, { status: 400 });
  }
}
