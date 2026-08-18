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

function normalizeStoragePath(value: unknown) {
  let p = String(value || '').trim();
  if (!p) return [];
  if (/^https?:\/\//i.test(p)) return [p];
  p = p.replace(/^\/+/, '');
  const candidates = [p];
  if (p.startsWith('documents/')) candidates.push(p.slice('documents/'.length));
  try {
    const decoded = decodeURIComponent(p);
    if (decoded !== p) candidates.push(decoded);
  } catch {}
  return Array.from(new Set(candidates.filter(Boolean)));
}

async function downloadCandidate(db: any, value: unknown) {
  for (const candidate of normalizeStoragePath(value)) {
    if (/^https?:\/\//i.test(candidate)) {
      try {
        const response = await fetch(candidate, { cache: 'no-store' });
        if (response.ok) return { file: await response.arrayBuffer(), path: candidate };
      } catch {}
      continue;
    }
      const { data, error } = await db.storage.from('documents').download(candidate);
    if (!error && data) return { file: await data.arrayBuffer(), path: candidate };
    // Último recurso para paths válidos: gera uma URL assinada curta e baixa pelo servidor.
    try {
      const signed = await db.storage.from('documents').createSignedUrl(candidate, 120);
      if (signed.data?.signedUrl) {
        const response = await fetch(signed.data.signedUrl, { cache: 'no-store' });
        if (response.ok) return { file: await response.arrayBuffer(), path: candidate };
      }
    } catch {}
  }
  return null;
}

/**
 * Visualização interna da assinatura.
 *
 * Prioridade:
 * 1. PDF intermediário gravado em signature_requests.final_document_path;
 * 2. último document_signatures.signed_document_url da solicitação;
 * 3. documento original.
 *
 * A rota também aceita paths antigos com o prefixo "documents/" e URLs http(s),
 * evitando que um caminho salvo por uma versão anterior quebre o visualizador.
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

    const { data: doc, error: docError } = await db
      .from('documents')
      .select('id,title,storage_path')
      .eq('id', requestRow.document_id)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (docError) {
      console.error('[AdvOS] Falha ao localizar documento:', docError);
      return new NextResponse('Não foi possível localizar o documento.', { status: 500 });
    }

    const title = String(doc?.title || 'documento-assinatura');
    const candidates: unknown[] = [];

    // A versão intermediária/final é sempre preferida quando existe.
    if (requestRow.final_document_path) candidates.push(requestRow.final_document_path);

    // Recupera o último arquivo associado a uma assinatura da mesma solicitação.
    // Isso cobre versões em que o update de signature_requests ocorreu depois do upload.
    const { data: signedRows } = await db
      .from('document_signatures')
      .select('signed_document_url,signed_at')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('document_id', requestRow.document_id)
      .order('signed_at', { ascending: false })
      .limit(10);

    for (const row of signedRows || []) {
      if (row?.signed_document_url) candidates.push(row.signed_document_url);
    }

    // Fallback: documento original.
    if (doc?.storage_path) candidates.push(doc.storage_path);

    let downloaded: { file: ArrayBuffer; path: string } | null = null;
    const attempted: string[] = [];
    for (const candidate of candidates) {
      for (const normalized of normalizeStoragePath(candidate)) attempted.push(normalized);
      downloaded = await downloadCandidate(db, candidate);
      if (downloaded) break;
    }

    if (!downloaded) {
      console.error('[AdvOS] Nenhum arquivo encontrado para preview:', {
        requestId: id,
        final_document_path: requestRow.final_document_path,
        original_storage_path: doc?.storage_path,
        attempted,
      });
      return new NextResponse('Documento não encontrado', {
        status: 404,
        headers: { 'X-AdvOS-Preview-Error': 'storage-file-not-found' },
      });
    }

    const bytes = Buffer.from(downloaded.file);
    const url = new URL(req.url);
    const forceDownload = url.searchParams.get('download') === '1';
    const filename = safeFilename(`${title}.pdf`);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-AdvOS-Preview-Source': downloaded.path === String(requestRow.final_document_path || '').trim() ? 'signature-request' : 'fallback',
      },
    });
  } catch (error: any) {
    console.error('[AdvOS] Erro no preview da assinatura:', error);
    return new NextResponse('Não foi possível abrir o documento.', { status: 500 });
  }
}
