import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { assertContentLength, enforceRateLimit, SecurityError } from '@/lib/security';
import { assertSafeUploadedFile } from '@/lib/fileSecurity';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function text(value: FormDataEntryValue | null) {
  return String(value || '').trim();
}

function redirectTo(req: Request, clientId: string, key: string) {
  return NextResponse.redirect(new URL(`/app/clientes/${encodeURIComponent(clientId)}?${key}=1`, req.url), 303);
}

async function loadClient(admin: any, lawFirmId: string, clientId: string) {
  const { data, error } = await admin
    .from('clients')
    .select('*')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    await enforceRateLimit(admin, `user:${session.user.id}:client-avatar-read`, 1200, 600, 'Muitos acessos a fotos em pouco tempo. Aguarde e tente novamente.');

    const clientId = String(new URL(req.url).searchParams.get('client_id') || '').trim();
    if (!clientId) return new NextResponse('Cliente não informado.', { status: 400 });

    const client = await loadClient(admin, profile.law_firm_id, clientId);
    if (!client?.id || !client?.avatar_path) return new NextResponse('Foto não encontrada.', { status: 404 });

    const { data: file, error } = await admin.storage.from('documents').download(client.avatar_path);
    if (error || !file) return new NextResponse('Foto não encontrada.', { status: 404 });
    if (file.size > 2 * 1024 * 1024) return new NextResponse('Foto inválida.', { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = String(file.type || 'image/webp').toLowerCase();
    if (!ALLOWED_MIME.has(contentType)) return new NextResponse('Formato de foto inválido.', { status: 415 });

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=300, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="foto-cliente.webp"',
      },
    });
  } catch (error) {
    console.error('Erro ao carregar foto do cliente:', error);
    if (error instanceof SecurityError) return new NextResponse(error.message, { status: error.status });
    return new NextResponse('Não foi possível carregar a foto.', { status: 400 });
  }
}

export async function POST(req: Request) {
  let clientId = '';
  try {
    const { session, profile } = await getCurrentProfile();
    assertContentLength(req, MAX_AVATAR_BYTES + 512 * 1024);
    const form = await req.formData();
    clientId = text(form.get('client_id'));
    const remove = ['1', 'true', 'yes', 'sim'].includes(text(form.get('remove')).toLowerCase());
    if (!clientId) return NextResponse.json({ ok: false, error: 'Cliente não informado.' }, { status: 400 });

    const admin = createAdminSupabase();
    await enforceRateLimit(admin, `user:${session.user.id}:client-avatar-write`, 30, 600, 'Muitas alterações de foto em pouco tempo. Aguarde e tente novamente.');
    const client = await loadClient(admin, profile.law_firm_id, clientId);
    if (!client?.id) return NextResponse.json({ ok: false, error: 'Cliente não encontrado.' }, { status: 404 });

    if (remove) {
      if (client.avatar_path) await admin.storage.from('documents').remove([client.avatar_path]).catch(() => null);
      const { error: updateError } = await admin
        .from('clients')
        .update({ avatar_path: null, avatar_updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', clientId);
      if (updateError) throw new Error(updateError.message);

      await recordSecurityEvent({ lawFirmId: profile.law_firm_id, authUserId: session.user.id, eventType: 'client_avatar_removed', entity: 'clients', entityId: clientId, req });
      return redirectTo(req, clientId, 'foto_removida');
    }

    const file = form.get('avatar');
    if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ ok: false, error: 'Selecione uma foto.' }, { status: 400 });
    if (file.size > MAX_AVATAR_BYTES) return NextResponse.json({ ok: false, error: 'A foto deve ter no máximo 8 MB.' }, { status: 413 });

    const mime = String(file.type || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) return NextResponse.json({ ok: false, error: 'Use uma imagem JPG, PNG ou WebP.' }, { status: 415 });

    const original = Buffer.from(await file.arrayBuffer());
    assertSafeUploadedFile(file.name || 'foto-cliente.jpg', mime, original);

    const sharp = (await import('sharp')).default;
    const optimized = await sharp(original, { failOn: 'none' })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'attention', withoutEnlargement: false })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();

    assertSafeUploadedFile('foto-cliente.webp', 'image/webp', optimized);
    const storagePath = `${profile.law_firm_id}/clientes/${clientId}/perfil/avatar-${Date.now()}.webp`;
    const upload = await admin.storage.from('documents').upload(storagePath, optimized, { contentType: 'image/webp', upsert: false });
    if (upload.error) throw new Error(upload.error.message);

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('clients')
      .update({ avatar_path: storagePath, avatar_updated_at: now })
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', clientId);

    if (updateError) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      throw new Error(updateError.message);
    }

    if (client.avatar_path && client.avatar_path !== storagePath) {
      await admin.storage.from('documents').remove([client.avatar_path]).catch(() => null);
    }

    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: 'client_avatar_updated',
      entity: 'clients',
      entityId: clientId,
      req,
      metadata: { original_bytes: original.length, stored_bytes: optimized.length },
    });

    return redirectTo(req, clientId, 'foto_atualizada');
  } catch (error: any) {
    console.error('Erro ao atualizar foto do cliente:', error);
    if (error instanceof SecurityError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (clientId) return NextResponse.redirect(new URL(`/app/clientes/${encodeURIComponent(clientId)}?foto_erro=1`, req.url), 303);
    return NextResponse.json({ ok: false, error: 'Não foi possível atualizar a foto.' }, { status: 400 });
  }
}
