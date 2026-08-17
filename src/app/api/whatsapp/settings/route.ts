import { NextResponse } from 'next/server';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadWhatsappSettings, normalizeStageKey, WHATSAPP_COLORS } from '@/lib/whatsappSettings';
import { assertContentLength, readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function text(value: any, max = 200) {
  return String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').slice(0, max);
}

function safeColor(value: any) {
  const color = text(value, 20);
  return (WHATSAPP_COLORS as readonly string[]).includes(color) ? color : 'slate';
}

function messageText(value: any, max = 4096) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, max);
}

function keywordList(value: any) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(source.map((item: any) => text(item, 60).toLocaleLowerCase('pt-BR')).filter(Boolean))).slice(0, 20);
}

async function settingsResponse(admin: any, lawFirmId: string) {
  const settings = await loadWhatsappSettings(admin, lawFirmId);
  return NextResponse.json({ ok: true, ...settings }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  try {
    const { profile } = await getCurrentProfile();
    if (!isAdminRole(profile.role)) return NextResponse.json({ ok: false, error: 'Apenas administradores podem alterar as configurações do WhatsApp.' }, { status: 403 });
    const admin = createAdminSupabase();
    return await settingsResponse(admin, profile.law_firm_id);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Erro ao carregar configurações do WhatsApp.') }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    assertContentLength(req, 256 * 1024);
    const { profile } = await getCurrentProfile();
    if (!isAdminRole(profile.role)) return NextResponse.json({ ok: false, error: 'Apenas administradores podem alterar as configurações do WhatsApp.' }, { status: 403 });
    const admin = createAdminSupabase();
    const body = await readJsonBody(req, 256 * 1024);
    const action = text(body?.action, 50);

    if (action === 'save_lead_tracking') {
      const { data: existing, error: existingError } = await admin
        .from('lead_tracking_settings')
        .select('law_firm_id')
        .eq('law_firm_id', profile.law_firm_id)
        .maybeSingle();
      if (existingError && ['42P01', 'PGRST205'].includes(String(existingError.code || ''))) {
        throw new Error('Rode o SQL v9_57_lead_attribution_meta_google.sql no Supabase antes de ativar o rastreamento de leads.');
      }
      if (existingError) throw new Error(existingError.message);

      const payload = {
        law_firm_id: profile.law_firm_id,
        meta_tracking_enabled: body?.metaTrackingEnabled !== false,
        google_tracking_enabled: body?.googleTrackingEnabled !== false,
        auto_qualify_paid_leads: body?.autoQualifyPaidLeads !== false,
        google_default_message: messageText(body?.googleDefaultMessage, 600) || 'Olá! Gostaria de falar com um advogado.',
        updated_at: new Date().toISOString(),
      };
      const query = existing?.law_firm_id
        ? admin.from('lead_tracking_settings').update(payload).eq('law_firm_id', profile.law_firm_id)
        : admin.from('lead_tracking_settings').insert(payload);
      const { error } = await query;
      if (error) throw new Error(error.message);
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'save_auto_reply') {
      const id = text(body?.id, 80);
      const name = text(body?.name, 80);
      const message = messageText(body?.message);
      const triggerType = body?.triggerType === 'keyword' ? 'keyword' : 'new_lead';
      const keywords = triggerType === 'keyword' ? keywordList(body?.keywords) : [];
      const department = body?.department === 'financeiro_juridico' || body?.department === 'atendimento' ? body.department : null;
      if (!name) throw new Error('Informe um nome para a resposta automática.');
      if (!message) throw new Error('Informe a mensagem automática.');
      if (triggerType === 'keyword' && !keywords.length) throw new Error('Informe pelo menos uma palavra-chave.');

      const payload = {
        law_firm_id: profile.law_firm_id,
        name,
        trigger_type: triggerType,
        message,
        keywords,
        department,
        active: body?.active !== false,
        sort_order: Math.max(0, Math.min(9999, Number(body?.sortOrder || 10) || 10)),
        updated_at: new Date().toISOString(),
      };
      const query = id
        ? admin.from('whatsapp_auto_replies').update(payload).eq('law_firm_id', profile.law_firm_id).eq('id', id)
        : admin.from('whatsapp_auto_replies').insert(payload);
      const { error } = await query;
      if (error) {
        if (['42P01', 'PGRST205'].includes(String(error.code || ''))) throw new Error('Rode o SQL v9_56_whatsapp_auto_replies.sql no Supabase antes de cadastrar respostas automáticas.');
        throw new Error(error.message);
      }
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'set_auto_reply_active') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Resposta automática inválida.');
      const { error } = await admin
        .from('whatsapp_auto_replies')
        .update({ active: body?.active === true, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', id);
      if (error) throw new Error(error.message);
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'delete_auto_reply') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Resposta automática inválida.');
      const { error } = await admin.from('whatsapp_auto_replies').delete().eq('law_firm_id', profile.law_firm_id).eq('id', id);
      if (error) throw new Error(error.message);
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'save_tag') {
      const id = text(body?.id, 80);
      const name = text(body?.name, 48);
      if (!name) throw new Error('Informe o nome da tag.');
      const payload = {
        law_firm_id: profile.law_firm_id,
        name,
        color: safeColor(body?.color),
        active: body?.active !== false,
        sort_order: Math.max(0, Math.min(9999, Number(body?.sortOrder || 0) || 0)),
        updated_at: new Date().toISOString(),
      };

      let query;
      if (id) query = admin.from('whatsapp_tags').update(payload).eq('law_firm_id', profile.law_firm_id).eq('id', id);
      else query = admin.from('whatsapp_tags').insert(payload);
      const { error } = await query;
      if (error) {
        if (String(error.code || '') === '23505') throw new Error('Já existe uma tag com esse nome.');
        throw new Error(error.message);
      }
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'set_tag_active') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Tag inválida.');
      const active = body?.active === true;
      const { data, error } = await admin
        .from('whatsapp_tags')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error('Tag não encontrada.');
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'delete_tag') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Tag inválida.');

      const { data: tag, error: tagError } = await admin
        .from('whatsapp_tags')
        .select('id,name')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', id)
        .maybeSingle();
      if (tagError) throw new Error(tagError.message);
      if (!tag?.id) throw new Error('Tag não encontrada.');

      const { data: links, error: linksError } = await admin
        .from('whatsapp_conversation_tags')
        .select('conversation_id')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('tag_id', id);
      if (linksError) throw new Error(linksError.message);

      const conversationIds = Array.from(new Set((links || []).map((row: any) => String(row?.conversation_id || '')).filter(Boolean)));
      const { error } = await admin
        .from('whatsapp_tags')
        .delete()
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', id);
      if (error) throw new Error(error.message);

      // A FK remove os vínculos relacionais em cascata. Também limpamos o array legado
      // mantido por compatibilidade com versões antigas e pesquisas simples.
      if (conversationIds.length) {
        const { data: conversations, error: conversationsError } = await admin
          .from('whatsapp_conversations')
          .select('id,tags')
          .eq('law_firm_id', profile.law_firm_id)
          .in('id', conversationIds);
        if (conversationsError) throw new Error(conversationsError.message);
        const removedName = String(tag.name || '').trim().toLocaleLowerCase('pt-BR');
        for (const conversation of conversations || []) {
          const nextTags = (Array.isArray(conversation?.tags) ? conversation.tags : [])
            .map((value: any) => String(value || '').trim())
            .filter((value: string) => value && value.toLocaleLowerCase('pt-BR') !== removedName);
          const { error: updateError } = await admin
            .from('whatsapp_conversations')
            .update({ tags: nextTags, updated_at: new Date().toISOString() })
            .eq('law_firm_id', profile.law_firm_id)
            .eq('id', conversation.id);
          if (updateError) throw new Error(updateError.message);
        }
      }

      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'save_stage') {
      const id = text(body?.id, 80);
      const name = text(body?.name, 60);
      if (!name) throw new Error('Informe o nome da etapa.');
      const outcome = ['open', 'won', 'lost'].includes(String(body?.outcome || 'open')) ? String(body?.outcome || 'open') : 'open';
      let stageKey = text(body?.stageKey, 48);
      if (!id) stageKey = normalizeStageKey(stageKey || name);

      const payload: any = {
        law_firm_id: profile.law_firm_id,
        name,
        color: safeColor(body?.color),
        active: body?.active !== false,
        sort_order: Math.max(0, Math.min(9999, Number(body?.sortOrder || 0) || 0)),
        outcome,
        updated_at: new Date().toISOString(),
      };
      if (!id) payload.stage_key = stageKey;

      let query;
      if (id) query = admin.from('whatsapp_lead_stages').update(payload).eq('law_firm_id', profile.law_firm_id).eq('id', id);
      else query = admin.from('whatsapp_lead_stages').insert(payload);
      const { error } = await query;
      if (error) {
        if (String(error.code || '') === '23505') throw new Error('Já existe uma etapa com esse nome ou identificador.');
        throw new Error(error.message);
      }
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'save_stage_order') {
      const stageIds = Array.from(new Set((Array.isArray(body?.stageIds) ? body.stageIds : []).map((value: any) => text(value, 80)).filter(Boolean)));
      if (!stageIds.length) throw new Error('Ordem de etapas inválida.');
      const { data: rows, error: rowsError } = await admin
        .from('whatsapp_lead_stages')
        .select('id')
        .eq('law_firm_id', profile.law_firm_id)
        .in('id', stageIds);
      if (rowsError) throw new Error(rowsError.message);
      if ((rows || []).length !== stageIds.length) throw new Error('Uma ou mais etapas não pertencem a este escritório.');
      for (let index = 0; index < stageIds.length; index += 1) {
        const { error } = await admin
          .from('whatsapp_lead_stages')
          .update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() })
          .eq('law_firm_id', profile.law_firm_id)
          .eq('id', stageIds[index]);
        if (error) throw new Error(error.message);
      }
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'delete_stage') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Etapa inválida.');
      const { data: stage, error: stageError } = await admin
        .from('whatsapp_lead_stages')
        .select('stage_key')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', id)
        .maybeSingle();
      if (stageError) throw new Error(stageError.message);
      if (!stage?.stage_key) throw new Error('Etapa não encontrada.');

      const { count } = await admin
        .from('whatsapp_leads')
        .select('id', { count: 'exact', head: true })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('stage', stage.stage_key);
      if (Number(count || 0) > 0) throw new Error('Existem leads nessa etapa. Mova-os antes de excluir a etapa.');

      const { data: preferences } = await admin
        .from('whatsapp_preferences')
        .select('default_lead_stage_key')
        .eq('law_firm_id', profile.law_firm_id)
        .maybeSingle();
      if (preferences?.default_lead_stage_key === stage.stage_key) throw new Error('Essa é a etapa inicial. Escolha outra etapa inicial antes de excluí-la.');

      const { error } = await admin.from('whatsapp_lead_stages').delete().eq('law_firm_id', profile.law_firm_id).eq('id', id);
      if (error) throw new Error(error.message);
      return await settingsResponse(admin, profile.law_firm_id);
    }

    if (action === 'save_preferences') {
      const singular = text(body?.leadLabelSingular, 40) || 'Lead';
      const plural = text(body?.leadLabelPlural, 40) || 'Leads';
      const defaultStage = text(body?.defaultLeadStageKey, 48) || 'novo';
      const defaultDepartment = body?.defaultDepartment === 'financeiro_juridico' ? 'financeiro_juridico' : 'atendimento';

      const { data: validStage } = await admin
        .from('whatsapp_lead_stages')
        .select('stage_key')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('stage_key', defaultStage)
        .eq('active', true)
        .eq('outcome', 'open')
        .maybeSingle();
      if (!validStage?.stage_key) throw new Error('Selecione uma etapa inicial ativa e aberta.');

      const { error } = await admin.from('whatsapp_preferences').upsert({
        law_firm_id: profile.law_firm_id,
        lead_label_singular: singular,
        lead_label_plural: plural,
        default_lead_stage_key: defaultStage,
        default_department: defaultDepartment,
        auto_save_client_media: body?.autoSaveClientMedia !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'law_firm_id' });
      if (error) throw new Error(error.message);
      return await settingsResponse(admin, profile.law_firm_id);
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível salvar a configuração.') }, { status });
  }
}
