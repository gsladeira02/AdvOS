import { NextResponse } from 'next/server';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadWhatsappSettings, normalizeStageKey, WHATSAPP_COLORS } from '@/lib/whatsappSettings';
import { assertContentLength, readJsonBody, SecurityError } from '@/lib/security';

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
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar configurações do WhatsApp.' }, { status: 400 });
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

    if (action === 'delete_tag') {
      const id = text(body?.id, 80);
      if (!id) throw new Error('Tag inválida.');
      const { count } = await admin
        .from('whatsapp_conversation_tags')
        .select('conversation_id', { count: 'exact', head: true })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('tag_id', id);
      if (Number(count || 0) > 0) throw new Error('Essa tag já está em uso. Desative-a em vez de excluir.');
      const { error } = await admin.from('whatsapp_tags').delete().eq('law_firm_id', profile.law_firm_id).eq('id', id);
      if (error) throw new Error(error.message);
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
    return NextResponse.json({ ok: false, error: error?.message || 'Não foi possível salvar a configuração.' }, { status });
  }
}
