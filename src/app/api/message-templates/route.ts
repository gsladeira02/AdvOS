import { NextResponse } from 'next/server';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { assertContentLength, readJsonBody, SecurityError } from '@/lib/security';

function slugify(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'modelo';
}

function normalizeShortcut(value: any, fallback: string) {
  const raw = String(value || fallback || '').trim() || fallback;
  const withoutSlash = raw.replace(/^\/+/, '');
  const clean = slugify(withoutSlash).replace(/_/g, '_');
  return `/${clean || slugify(fallback)}`;
}

async function uniqueSlug(admin: any, lawFirmId: string, base: string, id?: string) {
  const cleanBase = slugify(base);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? cleanBase : `${cleanBase}_${i + 1}`;
    let query = admin
      .from('message_templates')
      .select('id')
      .eq('law_firm_id', lawFirmId)
      .eq('slug', candidate)
      .limit(1);
    if (id) query = query.neq('id', id);
    const { data } = await query.maybeSingle();
    if (!data?.id) return candidate;
  }
  return `${cleanBase}_${Date.now()}`;
}

function wantsJson(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  const accept = req.headers.get('accept') || '';
  return contentType.includes('application/json') || accept.includes('application/json');
}

async function parseBody(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  assertContentLength(req, 256 * 1024);
  if (contentType.includes('application/json')) return await readJsonBody(req, 256 * 1024);
  const form = await req.formData();
  return Object.fromEntries(form.entries());
}

function redirect(req: Request, path: string) {
  return NextResponse.redirect(new URL(path, req.url), 303);
}

export async function GET() {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from('message_templates')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .order('category')
      .order('name');
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, templates: data || [] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar modelos.' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const jsonMode = wantsJson(req);
  try {
    const { profile } = await getCurrentProfile();
    if (!isAdminRole(profile.role)) {
      if (jsonMode) return NextResponse.json({ ok: false, error: 'Apenas administradores podem alterar modelos de mensagem.' }, { status: 403 });
      return redirect(req, '/app/whatsapp?view=atendimento');
    }
    const admin = createAdminSupabase();
    const form = await parseBody(req);
    const intent = String(form.intent || 'save');
    const id = String(form.id || '').trim();

    if (intent === 'delete' && id) {
      const { error } = await admin.from('message_templates').delete().eq('id', id).eq('law_firm_id', profile.law_firm_id);
      if (error) throw new Error(error.message);
      if (jsonMode) return NextResponse.json({ ok: true, deleted: id });
      return redirect(req, '/app/whatsapp?view=configuracoes&section=modelos&ok=apagado');
    }

    const name = String(form.name || '').trim();
    const body = String(form.body || '').trim();
    const category = String(form.category || 'geral').trim() || 'geral';
    const active = String(form.active ?? 'true') === 'true';

    if (!name || !body) throw new Error('Preencha nome e mensagem do modelo.');

    let slug = String(form.slug || '').trim();
    if (!slug) slug = await uniqueSlug(admin, profile.law_firm_id, name, id || undefined);
    else slug = await uniqueSlug(admin, profile.law_firm_id, slug, id || undefined);

    const shortcut = normalizeShortcut(form.shortcut, slug || name);
    const metaTemplateName = String(form.meta_template_name || form.metaTemplateName || '').trim()
      .replace(/^\/+/, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    const metaTemplateLanguage = String(form.meta_template_language || form.metaTemplateLanguage || 'pt_BR').trim() || 'pt_BR';

    const payload = {
      law_firm_id: profile.law_firm_id,
      name,
      slug,
      shortcut,
      category,
      body,
      active,
      meta_template_name: metaTemplateName || null,
      meta_template_language: metaTemplateLanguage,
      updated_at: new Date().toISOString(),
    };

    let saved: any = null;
    if (id) {
      const { data, error } = await admin
        .from('message_templates')
        .update(payload)
        .eq('id', id)
        .eq('law_firm_id', profile.law_firm_id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      saved = data;
    } else {
      const { data, error } = await admin
        .from('message_templates')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      saved = data;
    }

    if (jsonMode) return NextResponse.json({ ok: true, template: saved });
    return redirect(req, '/app/whatsapp?view=configuracoes&section=modelos&ok=salvo');
  } catch (error: any) {
    const message = error?.message || 'Erro ao salvar modelo.';
    const status = error instanceof SecurityError ? error.status : 400;
    if (jsonMode) return NextResponse.json({ ok: false, error: message }, { status });
    return redirect(req, `/app/whatsapp?view=configuracoes&section=modelos&erro=${encodeURIComponent(message)}`);
  }
}
