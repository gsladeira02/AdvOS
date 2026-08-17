import { NextResponse } from 'next/server';
import { publicErrorMessage, readJsonBody } from '@/lib/security';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { attachConversationMediaToClientFolder } from '@/lib/whatsappCRM';
import { recordWhatsappEvent } from '@/lib/whatsappOperations';
import { LOSS_REASON_LABELS } from '@/lib/marketingDashboard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEPARTMENTS = new Set(['atendimento','financeiro_juridico']);
const LOSS_REASONS = new Set(Object.keys(LOSS_REASON_LABELS));

function text(value: any, max = 500) {
  return String(value ?? '').trim().slice(0, max);
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

async function setConversationTags(admin: any, lawFirmId: string, conversationId: string, rawIds: any) {
  const requestedIds = Array.from(new Set((Array.isArray(rawIds) ? rawIds : []).map((value: any) => text(value, 80)).filter(Boolean))).slice(0, 20);

  let validTags: any[] = [];
  if (requestedIds.length) {
    const { data, error } = await admin
      .from('whatsapp_tags')
      .select('id,name,color,active,sort_order')
      .eq('law_firm_id', lawFirmId)
      .eq('active', true)
      .in('id', requestedIds);
    if (error) throw new Error(error.message);
    validTags = data || [];
    if (validTags.length !== requestedIds.length) throw new Error('Uma ou mais tags selecionadas não estão disponíveis.');
  }

  const { error: deleteError } = await admin
    .from('whatsapp_conversation_tags')
    .delete()
    .eq('law_firm_id', lawFirmId)
    .eq('conversation_id', conversationId);
  if (deleteError) throw new Error(deleteError.message);

  if (validTags.length) {
    const { error: insertError } = await admin
      .from('whatsapp_conversation_tags')
      .insert(validTags.map((tag: any) => ({ law_firm_id: lawFirmId, conversation_id: conversationId, tag_id: tag.id })));
    if (insertError) throw new Error(insertError.message);
  }

  // Mantém o array legado sincronizado para compatibilidade com versões anteriores e busca simples.
  const legacyNames = validTags
    .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .map((tag: any) => String(tag.name));
  const { error: legacyError } = await admin
    .from('whatsapp_conversations')
    .update({ tags: legacyNames, updated_at: new Date().toISOString() })
    .eq('law_firm_id', lawFirmId)
    .eq('id', conversationId);
  if (legacyError) throw new Error(legacyError.message);

  return validTags;
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const body = await readJsonBody(req, 262144);
    const action = text(body?.action, 50);
    const conversationId = text(body?.conversationId, 80);
    if (!conversationId) return NextResponse.json({ ok: false, error: 'Conversa inválida.' }, { status: 400 });

    const conversation = await loadConversation(admin, profile.law_firm_id, conversationId);

    if (action === 'set_assignee') {
      if (conversation?.virtual) return NextResponse.json({ ok: false, error: 'Inicie uma conversa real antes de definir responsável.' }, { status: 400 });
      const requestedAssignee = text(body?.assigneeId, 80) || null;
      let assignedUser: any = null;
      if (requestedAssignee) {
        const { data, error } = await admin
          .from('profiles')
          .select('auth_user_id,full_name,email,role,status')
          .eq('law_firm_id', profile.law_firm_id)
          .eq('auth_user_id', requestedAssignee)
          .eq('status', 'ativo')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data?.auth_user_id) return NextResponse.json({ ok: false, error: 'Usuário responsável inválido ou inativo.' }, { status: 400 });
        assignedUser = data;
      }
      const now = new Date().toISOString();
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({
          assigned_to: requestedAssignee,
          assigned_at: requestedAssignee ? now : null,
          assigned_by: requestedAssignee ? session.user.id : null,
          updated_at: now,
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, {
        lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id,
        eventType: requestedAssignee ? 'assignee_changed' : 'assignee_cleared',
        description: requestedAssignee ? `Responsável definido: ${assignedUser?.full_name || 'usuário'}.` : 'Responsável removido da conversa.',
        metadata: { previous_assignee: conversation?.assigned_to || null, assignee_id: requestedAssignee },
      });
      return NextResponse.json({ ok: true, assignedTo: requestedAssignee, assignedUser });
    }

    if (action === 'add_internal_note') {
      if (conversation?.virtual) return NextResponse.json({ ok: false, error: 'Inicie uma conversa real antes de criar nota interna.' }, { status: 400 });
      const noteBody = text(body?.note, 5000);
      if (!noteBody) return NextResponse.json({ ok: false, error: 'Escreva a nota interna.' }, { status: 400 });
      const { data: note, error } = await admin
        .from('whatsapp_internal_notes')
        .insert({ law_firm_id: profile.law_firm_id, conversation_id: conversationId, author_id: session.user.id, body: noteBody })
        .select('id,conversation_id,author_id,body,created_at,updated_at')
        .single();
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, {
        lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id,
        eventType: 'internal_note_added', description: 'Adicionou uma nota interna.', metadata: { note_id: note.id },
      });
      return NextResponse.json({ ok: true, note: { ...note, author: { auth_user_id: session.user.id, full_name: profile.full_name, email: profile.email } } });
    }

    if (action === 'delete_internal_note') {
      const noteId = text(body?.noteId, 80);
      if (!noteId) return NextResponse.json({ ok: false, error: 'Nota inválida.' }, { status: 400 });
      const { data: note, error: noteError } = await admin
        .from('whatsapp_internal_notes')
        .select('id,author_id')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId)
        .eq('id', noteId)
        .maybeSingle();
      if (noteError) throw new Error(noteError.message);
      if (!note?.id) return NextResponse.json({ ok: false, error: 'Nota não encontrada.' }, { status: 404 });
      if (String(note.author_id || '') !== String(session.user.id) && !isAdminRole(profile.role)) {
        return NextResponse.json({ ok: false, error: 'Você só pode excluir suas próprias notas internas.' }, { status: 403 });
      }
      const { error } = await admin.from('whatsapp_internal_notes').delete().eq('law_firm_id', profile.law_firm_id).eq('id', noteId);
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, {
        lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id,
        eventType: 'internal_note_deleted', description: 'Excluiu uma nota interna.', metadata: { note_id: noteId },
      });
      return NextResponse.json({ ok: true, deletedNoteId: noteId });
    }

    if (action === 'close_conversation') {
      if (conversation?.closed_at) {
        return NextResponse.json({ ok: true, closed: true, alreadyClosed: true, closedAt: conversation.closed_at });
      }
      const department = DEPARTMENTS.has(String(conversation?.department || '')) ? String(conversation.department) : 'atendimento';
      const closedAt = new Date().toISOString();
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({
          status: 'encerrada',
          closed_at: closedAt,
          closed_from_department: department,
          updated_at: closedAt,
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'conversation_closed', description: 'Atendimento encerrado.', metadata: { department } });
      return NextResponse.json({ ok: true, closed: true, closedAt, department });
    }

    if (action === 'reopen_conversation') {
      const department = DEPARTMENTS.has(String(conversation?.closed_from_department || ''))
        ? String(conversation.closed_from_department)
        : DEPARTMENTS.has(String(conversation?.department || ''))
          ? String(conversation.department)
          : 'atendimento';
      const now = new Date().toISOString();
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({
          status: 'aberta',
          department,
          closed_at: null,
          updated_at: now,
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'conversation_reopened', description: `Atendimento reaberto em ${department === 'financeiro_juridico' ? 'Financeiro/Jurídico' : 'Atendimento'}.`, metadata: { department } });
      return NextResponse.json({ ok: true, reopened: true, department });
    }

    if (action === 'set_department') {
      if (conversation?.closed_at) return NextResponse.json({ ok: false, error: 'Reabra a conversa antes de transferir de setor.' }, { status: 400 });
      const department = text(body?.department, 40);
      if (!DEPARTMENTS.has(department)) return NextResponse.json({ ok: false, error: 'Setor inválido.' }, { status: 400 });
      const { error } = await admin
        .from('whatsapp_conversations')
        .update({ department, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (error) throw new Error(error.message);
      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'department_changed', description: `Conversa transferida para ${department === 'financeiro_juridico' ? 'Financeiro/Jurídico' : 'Atendimento'}.`, metadata: { previous_department: conversation?.department || null, department } });
      return NextResponse.json({ ok: true, department });
    }

    if (action === 'set_tags') {
      const tags = await setConversationTags(admin, profile.law_firm_id, conversationId, body?.tagIds);
      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'tags_changed', description: tags.length ? `Tags atualizadas: ${tags.map((tag: any) => tag.name).join(', ')}.` : 'Todas as tags foram removidas.', metadata: { tag_ids: tags.map((tag: any) => tag.id) } });
      return NextResponse.json({ ok: true, tags });
    }

    if (action === 'update_lead') {
      const stage = text(body?.stage, 48);
      const { data: validStage } = await admin
        .from('whatsapp_lead_stages')
        .select('stage_key,name,outcome,active')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('stage_key', stage)
        .eq('active', true)
        .maybeSingle();
      if (!validStage?.stage_key) return NextResponse.json({ ok: false, error: 'Etapa do lead inválida.' }, { status: 400 });

      const lead = await loadLead(admin, profile.law_firm_id, conversationId);
      if (!lead) return NextResponse.json({ ok: false, error: 'Lead não encontrado.' }, { status: 404 });
      const updates: any = { stage, updated_at: new Date().toISOString() };
      if (body?.name !== undefined) updates.name = text(body.name, 160) || null;
      if (body?.email !== undefined) updates.email = text(body.email, 180) || null;
      if (body?.serviceInterest !== undefined) updates.service_interest = text(body.serviceInterest, 180) || null;
      if (body?.notes !== undefined) updates.notes = text(body.notes, 3000) || null;

      if (validStage.outcome === 'lost') {
        const lossReason = text(body?.lossReason, 80);
        if (!LOSS_REASONS.has(lossReason)) {
          return NextResponse.json({ ok: false, error: 'Informe o motivo da perda antes de marcar o lead como perdido.' }, { status: 400 });
        }
        updates.loss_reason = lossReason;
        updates.loss_notes = text(body?.lossNotes, 1000) || null;
        updates.lost_at = new Date().toISOString();
      } else if (String(lead.stage || '') !== stage) {
        updates.loss_reason = null;
        updates.loss_notes = null;
        updates.lost_at = null;
      }

      if (stage === 'qualificado' && !lead.qualified_at) updates.qualified_at = new Date().toISOString();
      if (stage === 'proposta' && !lead.proposal_sent_at) updates.proposal_sent_at = new Date().toISOString();
      if (validStage.outcome === 'won' && !lead.contracted_at) updates.contracted_at = new Date().toISOString();

      const { data, error } = await admin
        .from('whatsapp_leads')
        .update(updates)
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', lead.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const stageName = String(validStage.name || stage);
      const lossDescription = validStage.outcome === 'lost' ? ` Motivo: ${LOSS_REASON_LABELS[updates.loss_reason] || updates.loss_reason}.` : '';
      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'lead_stage_changed', description: `Lead movido para ${stageName}.${lossDescription}`, metadata: { previous_stage: lead.stage || null, stage, outcome: validStage.outcome, loss_reason: updates.loss_reason || null } });
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
        .update({ client_id: client.id, lead_name: client.name, updated_at: now })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);
      if (conversationError) throw new Error(conversationError.message);

      await admin
        .from('whatsapp_messages')
        .update({ client_id: client.id, updated_at: now })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId);

      if (lead?.id) {
        // Virar cliente e fechar contrato são marcos diferentes. O vínculo com o
        // cliente é preservado aqui; a etapa "Contratado" é aplicada quando um
        // contrato financeiro é criado (ou manualmente no funil).
        await admin
          .from('whatsapp_leads')
          .update({
            converted_client_id: client.id,
            converted_at: lead.converted_at || now,
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

      await recordWhatsappEvent(admin, { lawFirmId: profile.law_firm_id, conversationId, actorId: session.user.id, eventType: 'lead_converted', description: created ? `Lead convertido e cliente ${client.name || name} cadastrado.` : `Conversa vinculada ao cliente ${client.name || name}.`, metadata: { client_id: client.id, created } });
      return NextResponse.json({ ok: true, clientId: client.id, created, attachedMedia });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro ao gerenciar conversa do WhatsApp:', error);
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível atualizar a conversa.') }, { status: 400 });
  }
}
