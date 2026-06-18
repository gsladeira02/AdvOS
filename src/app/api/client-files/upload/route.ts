import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function str(v: FormDataEntryValue | null) { return String(v || '').trim(); }
function safeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'arquivo';
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const clientId = str(form.get('client_id'));
  const file = form.get('file');

  if (!clientId) return NextResponse.json({ error: 'Cliente não informado.' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo não informado.' }, { status: 400 });

  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from('clients')
    .select('id,name')
    .eq('id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

  const originalName = safeName(file.name || 'arquivo');
  const title = str(form.get('title')) || file.name || 'Arquivo do cliente';
  const docType = str(form.get('doc_type')) || 'outros';
  const notes = str(form.get('notes'));
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const storagePath = `${profile.law_firm_id}/clientes/${clientId}/${Date.now()}-${originalName}`;

  const upload = await admin.storage.from('documents').upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 });

  await admin.from('documents').insert({
    law_firm_id: profile.law_firm_id,
    client_id: clientId,
    title,
    doc_type: docType,
    storage_path: storagePath,
    notes: notes || `Arquivo enviado manualmente para a pasta do cliente. Nome original: ${file.name || originalName}`,
    signature_status: 'sem_assinatura',
  });

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: profile.auth_user_id,
    action: 'upload_pasta_cliente',
    entity: 'clients',
    entity_id: clientId,
  });

  return NextResponse.redirect(new URL(`/app/clientes/${clientId}?upload=1`, req.url), 303);
}
