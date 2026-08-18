import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeStoragePaths(value: unknown) {
  let p = String(value || '').trim();
  if (!p) return [] as string[];
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
  for (const candidate of normalizeStoragePaths(value)) {
    if (/^https?:\/\//i.test(candidate)) {
      try {
        const response = await fetch(candidate, { cache: 'no-store' });
        if (response.ok) return Buffer.from(await response.arrayBuffer());
      } catch {}
      continue;
    }
    const direct = await db.storage.from('documents').download(candidate);
    if (!direct.error && direct.data) return Buffer.from(await direct.data.arrayBuffer());
    try {
      const signed = await db.storage.from('documents').createSignedUrl(candidate, 120);
      if (signed.data?.signedUrl) {
        const response = await fetch(signed.data.signedUrl, { cache: 'no-store' });
        if (response.ok) return Buffer.from(await response.arrayBuffer());
      }
    } catch {}
  }
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const { profile } = await getCurrentProfile();
    const { requestId } = await params;
    const db = createAdminSupabase();
    const { data: requestRow, error } = await db
      .from('signature_requests')
      .select('id,law_firm_id,status,final_document_path,document_id')
      .eq('id', requestId)
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    if (error) return new NextResponse(`Erro ao consultar assinatura: ${error.message}`, { status: 500 });
    if (!requestRow) return new NextResponse('Assinatura não encontrada.', { status: 404 });
    if (String(requestRow.status || '').toLowerCase() !== 'assinado') {
      return new NextResponse('O documento ainda não foi concluído por todos os signatários.', { status: 409 });
    }

    const candidates: unknown[] = [];
    if (requestRow.final_document_path) candidates.push(requestRow.final_document_path);

    const { data: signatures } = await db
      .from('document_signatures')
      .select('signed_document_url,signed_at')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('document_id', requestRow.document_id)
      .order('signed_at', { ascending: false })
      .limit(10);
    for (const row of signatures || []) if (row?.signed_document_url) candidates.push(row.signed_document_url);

    let buffer: Buffer | null = null;
    for (const candidate of candidates) {
      buffer = await downloadCandidate(db, candidate);
      if (buffer) break;
    }
    if (!buffer) return new NextResponse('Documento assinado indisponível.', { status: 404 });

    const { data: doc } = await db.from('documents').select('title').eq('id', requestRow.document_id).eq('law_firm_id', profile.law_firm_id).maybeSingle();
    const name = String(doc?.title || 'documento-assinado').replace(/[\\/\r\n"]+/g, ' ').slice(0, 120);
    const download = new URL(req.url).searchParams.get('download') === '1';
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Não foi possível abrir o documento assinado: ${String(e?.message || e)}`, { status: 500 });
  }
}
