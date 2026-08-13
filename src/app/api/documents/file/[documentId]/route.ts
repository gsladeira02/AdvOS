import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

function safeFilename(value?: string | null, fallback = 'documento') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || fallback;
}

function canRenderInline(mime?: string | null) {
  const clean = String(mime || '').toLowerCase().split(';')[0].trim();
  return new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']).has(clean);
}

function safeHttpsUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function GET(req: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const { profile } = await getCurrentProfile();
    const { documentId } = await context.params;
    const id = String(documentId || '').trim();
    if (!id) return new NextResponse('Documento não encontrado.', { status: 404 });

    const admin = createAdminSupabase();
    const { data: doc } = await admin
      .from('documents')
      .select('id,title,storage_path,external_url')
      .eq('id', id)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (!doc) return new NextResponse('Documento não encontrado.', { status: 404 });

    if (!doc.storage_path) {
      const external = safeHttpsUrl(doc.external_url);
      if (external) return NextResponse.redirect(external, 302);
      return new NextResponse('Arquivo não disponível.', { status: 404 });
    }

    const { data: file, error } = await admin.storage.from('documents').download(doc.storage_path);
    if (error || !file) return new NextResponse('Arquivo não disponível.', { status: 404 });

    if (file.size > MAX_DOCUMENT_BYTES) {
      return new NextResponse('Arquivo excede o limite permitido.', { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_DOCUMENT_BYTES) {
      return new NextResponse('Arquivo excede o limite permitido.', { status: 413 });
    }

    const url = new URL(req.url);
    const forceDownload = url.searchParams.get('download') === '1';
    const contentType = file.type || 'application/octet-stream';
    const pathName = String(doc.storage_path).split('/').pop() || '';
    const filename = safeFilename(pathName || doc.title || `documento-${doc.id}`);
    const disposition = !forceDownload && canRenderInline(contentType) ? 'inline' : 'attachment';

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Erro ao servir documento privado:', error);
    return new NextResponse('Não foi possível abrir o documento.', { status: 400 });
  }
}
