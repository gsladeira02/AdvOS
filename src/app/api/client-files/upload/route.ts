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

function displayNameFromFile(file: File, customTitle?: string) {
  const title = String(customTitle || '').trim();
  return title || file.name || 'Arquivo do cliente';
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const clientId = str(form.get('client_id'));
  const ajax = str(form.get('ajax')) === '1';

  if (!clientId) {
    const payload = { error: 'Cliente não informado.' };
    return ajax ? NextResponse.json(payload, { status: 400 }) : NextResponse.redirect(new URL('/app/clientes', req.url), 303);
  }

  const admin = createAdminSupabase();
  const { data: client } = await admin
    .from('clients')
    .select('id,name')
    .eq('id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!client) {
    const payload = { error: 'Cliente não encontrado.' };
    return ajax ? NextResponse.json(payload, { status: 404 }) : NextResponse.redirect(new URL('/app/clientes', req.url), 303);
  }

  const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
  const legacyFile = form.get('file');
  if (!files.length && legacyFile instanceof File && legacyFile.size > 0) files.push(legacyFile);

  if (!files.length) {
    const payload = { error: 'Nenhum documento foi enviado.' };
    return ajax ? NextResponse.json(payload, { status: 400 }) : NextResponse.redirect(new URL(`/app/clientes/${clientId}?upload_error=1`, req.url), 303);
  }

  const titles = form.getAll('titles').map((value) => String(value || '').trim());
  const legacyTitle = str(form.get('title'));
  const uploaded: any[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const originalName = safeName(file.name || 'arquivo');
    const title = displayNameFromFile(file, titles[index] || legacyTitle);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storagePath = `${profile.law_firm_id}/clientes/${clientId}/${Date.now()}-${index}-${originalName}`;

    const upload = await admin.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (upload.error) {
      const payload = { error: upload.error.message, uploaded };
      return ajax ? NextResponse.json(payload, { status: 400 }) : NextResponse.redirect(new URL(`/app/clientes/${clientId}?upload_error=1`, req.url), 303);
    }

    const { data: documentRow, error: insertError } = await admin.from('documents').insert({
      law_firm_id: profile.law_firm_id,
      client_id: clientId,
      title,
      doc_type: 'arquivo_cliente',
      storage_path: storagePath,
      notes: `Arquivo enviado manualmente para a pasta do cliente. Nome original: ${file.name || originalName}`,
      signature_status: 'sem_assinatura',
    }).select('id,title,storage_path').single();

    if (insertError) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      const payload = { error: insertError.message, uploaded };
      return ajax ? NextResponse.json(payload, { status: 400 }) : NextResponse.redirect(new URL(`/app/clientes/${clientId}?upload_error=1`, req.url), 303);
    }

    uploaded.push(documentRow);
  }

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: profile.auth_user_id,
    action: uploaded.length > 1 ? 'upload_multiplos_arquivos_pasta_cliente' : 'upload_pasta_cliente',
    entity: 'clients',
    entity_id: clientId,
  });

  if (ajax) return NextResponse.json({ ok: true, uploaded });
  return NextResponse.redirect(new URL(`/app/clientes/${clientId}?upload=1`, req.url), 303);
}
