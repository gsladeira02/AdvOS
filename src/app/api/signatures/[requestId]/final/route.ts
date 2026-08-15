import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
    if (String(requestRow.status || '').toLowerCase() !== 'assinado' || !requestRow.final_document_path) {
      return new NextResponse('O documento ainda não foi concluído por todos os signatários.', { status: 409 });
    }
    const { data: file, error: fileError } = await db.storage.from('documents').download(requestRow.final_document_path);
    if (fileError || !file) return new NextResponse('Documento assinado indisponível.', { status: 404 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: doc } = await db.from('documents').select('title').eq('id', requestRow.document_id).eq('law_firm_id', profile.law_firm_id).maybeSingle();
    const name = String(doc?.title || 'documento-assinado').replace(/[\\/\r\n"]+/g, ' ').slice(0, 120);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${name}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Não foi possível abrir o documento assinado: ${String(e?.message || e)}`, { status: 500 });
  }
}
