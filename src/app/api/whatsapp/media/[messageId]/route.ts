import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getWhatsAppConfig } from '@/lib/whatsappApi';

export const dynamic = 'force-dynamic';

function str(value: any) {
  return String(value || '').trim();
}

function safeFilename(name?: string | null, fallback = 'arquivo') {
  return str(name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || fallback;
}

function mediaNode(message: any) {
  const raw = message?.raw_payload || {};
  return raw?.image || raw?.document || raw?.video || raw?.audio || raw?.sticker || null;
}

function mediaIdFromMessage(message: any) {
  const node = mediaNode(message);
  const fromNode = str(node?.id);
  if (fromNode) return fromNode;
  const mediaUrl = str(message?.media_url);
  return mediaUrl && !mediaUrl.startsWith('http') ? mediaUrl : '';
}

function extensionFromMime(mime?: string | null) {
  const clean = str(mime).toLowerCase();
  if (clean.includes('jpeg')) return 'jpg';
  if (clean.includes('png')) return 'png';
  if (clean.includes('webp')) return 'webp';
  if (clean.includes('pdf')) return 'pdf';
  if (clean.includes('mpeg')) return 'mp3';
  if (clean.includes('ogg')) return 'ogg';
  if (clean.includes('mp4')) return 'mp4';
  return 'bin';
}

export async function GET(req: Request, context: { params: Promise<{ messageId: string }> | { messageId: string } }) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const params = await context.params;
    const messageId = decodeURIComponent(params.messageId || '');
    const url = new URL(req.url);
    const download = url.searchParams.get('download') === '1';

    const { data: message, error } = await admin
      .from('whatsapp_messages')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!message?.id) return new NextResponse('Mídia não encontrada.', { status: 404 });

    const filename = safeFilename(message.file_name || mediaNode(message)?.filename || message.body, `whatsapp-${message.id}`);

    if (message.storage_path) {
      const signed = await admin.storage.from('documents').createSignedUrl(message.storage_path, 60 * 10, {
        download: download ? filename : false,
      });
      if (signed.data?.signedUrl) return NextResponse.redirect(signed.data.signedUrl, 302);
    }

    const direct = str(message.media_url);
    if (direct.startsWith('http')) return NextResponse.redirect(direct, 302);

    const mediaId = mediaIdFromMessage(message);
    if (!mediaId) return new NextResponse('Essa mensagem não possui mídia disponível para baixar.', { status: 404 });

    const config = await getWhatsAppConfig(profile.law_firm_id);
    if (!config.configured) throw new Error('WhatsApp API não configurado.');

    const metaResponse = await fetch(`${config.baseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    const meta = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok || !meta?.url) {
      const message = meta?.error?.message || 'Não foi possível buscar a mídia na Meta.';
      throw new Error(message);
    }

    const fileResponse = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    if (!fileResponse.ok) throw new Error('Não foi possível baixar a mídia da Meta.');

    const contentType = meta.mime_type || message.mime_type || fileResponse.headers.get('content-type') || 'application/octet-stream';
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    const finalName = filename.includes('.') ? filename : `${filename}.${extensionFromMime(contentType)}`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${finalName.replace(/"/g, '')}"`,
      },
    });
  } catch (error: any) {
    return new NextResponse(error?.message || 'Erro ao carregar mídia.', { status: 400 });
  }
}
