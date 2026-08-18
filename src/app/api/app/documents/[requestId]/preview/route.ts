import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeFilename(value?: string | null, fallback = 'documento') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || fallback;
}

/**
 * Visualização interna do documento de uma solicitação de assinatura.
 *
 * Depois que o primeiro signatário assina, signature_requests.final_document_path
 * passa a apontar para a versão intermediária que já contém as evidências da
 * assinatura do cliente. Essa versão deve ter prioridade sobre o documento
 * original, para que o escritório confira exatamente o que será finalizado.
 */
export async function GET(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { profile } = await getCurrentProfile();
    const { requestId } = await params;
    const id = String(requestId || '').trim();
    if (!id) return new NextResponse('Solicitação não encontrada', { status: 404 });

    const db = createAdminSupabase();
    const { data: requestRow, error: requestError } = await db
      .from('signature_requests')
      .select('id,law_firm_id,document_id,status,final_document_path')
      .eq('id', id)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (requestError) {
      console.error('[AdvOS] Falha ao localizar solicitação para preview:', requestError);
      return new NextResponse('Não foi possível localizar a solicitação.', { status: 500 });
    }
    if (!requestRow) return new NextResponse('Solicitação não encontrada', { status: 404 });

    let storagePath = String(requestRow.final_document_path || '').trim();
    let contentType = 'application/pdf';
    let title = 'documento-assinatura';

    // Após a assinatura do cliente, o PDF intermediário é a fonte correta.
    if (!storagePath) {
      const { data: doc, error: docError } = await db
        .from('documents')
        .select('storage_path,mime_type,title')
        .eq('id', requestRow.document_id)
        .eq('law_firm_id', profile.law_firm_id)
        .maybeSingle();

      if (docError) {
        console.error('[AdvOS] Falha ao localizar documento original:', docError);
        return new NextResponse('Não foi possível localizar o documento.', { status: 500 });
      }
      if (!doc?.storage_path) return new NextResponse('Documento não encontrado', { status: 404 });

      storagePath = String(doc.storage_path);
      contentType = String(doc.mime_type || 'application/pdf').split(';')[0] || 'application/pdf';
      title = String(doc.title || title);
    } else {
      const { data: doc } = await db
        .from('documents')
        .select('title')
        .eq('id', requestRow.document_id)
        .eq('law_firm_id', profile.law_firm_id)
        .maybeSingle();
      title = String(doc?.title || title);
    }

    const { data: file, error: fileError } = await db.storage.from('documents').download(storagePath);
    if (fileError || !file) {
      console.error('[AdvOS] Falha ao baixar documento do preview:', {
        requestId: id,
        storagePath,
        error: fileError,
      });
      return new NextResponse('Documento não encontrado', { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const url = new URL(req.url);
    const forceDownload = url.searchParams.get('download') === '1';
    const filename = safeFilename(`${title}${contentType === 'application/pdf' ? '.pdf' : ''}`);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[AdvOS] Erro no preview da assinatura:', error);
    return new NextResponse('Não foi possível abrir o documento.', { status: 500 });
  }
}
