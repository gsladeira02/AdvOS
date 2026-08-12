import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function slugify(value: FormDataEntryValue | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'modelo';
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const form = await req.formData();
  const intent = String(form.get('intent') || 'save');
  const id = String(form.get('id') || '');

  if (intent === 'delete' && id) {
    await admin.from('message_templates').delete().eq('id', id).eq('law_firm_id', profile.law_firm_id);
    return NextResponse.redirect(new URL('/app/modelos-mensagens?ok=apagado', req.url), 303);
  }

  const name = String(form.get('name') || '').trim();
  const body = String(form.get('body') || '').trim();
  const category = String(form.get('category') || 'geral').trim() || 'geral';
  const active = String(form.get('active') || 'false') === 'true';
  const slug = String(form.get('slug') || '').trim() || slugify(name);

  if (!name || !body) {
    return NextResponse.redirect(new URL('/app/modelos-mensagens?erro=campos', req.url), 303);
  }

  const payload = {
    law_firm_id: profile.law_firm_id,
    name,
    slug,
    category,
    body,
    active,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await admin.from('message_templates').update(payload).eq('id', id).eq('law_firm_id', profile.law_firm_id);
    if (error) return NextResponse.redirect(new URL(`/app/modelos-mensagens?erro=${encodeURIComponent(error.message)}`, req.url), 303);
  } else {
    const { error } = await admin.from('message_templates').insert(payload);
    if (error) return NextResponse.redirect(new URL(`/app/modelos-mensagens?erro=${encodeURIComponent(error.message)}`, req.url), 303);
  }

  return NextResponse.redirect(new URL('/app/modelos-mensagens?ok=salvo', req.url), 303);
}
