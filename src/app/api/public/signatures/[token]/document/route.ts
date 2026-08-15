import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function GET(_req: Request, { params }: { params: Promise<{ token:string }> }) {
  const { token } = await params;
  const admin = createAdminSupabase();
  const { data: requestRow } = await admin.from('signature_requests').select('id,law_firm_id,document_id,status,expires_at').eq('public_token', token).maybeSingle();
  if (!requestRow) return new NextResponse('Solicitação não encontrada.', { status:404 });
  if (requestRow.expires_at && new Date(requestRow.expires_at).getTime() < Date.now() && requestRow.status !== 'assinado') return new NextResponse('Link expirado.', { status:410 });
  const { data: doc } = await admin.from('documents').select('title,storage_path').eq('id',requestRow.document_id).eq('law_firm_id',requestRow.law_firm_id).maybeSingle();
  if (!doc?.storage_path) return new NextResponse('Documento indisponível.', { status:404 });
  const { data: file, error } = await admin.storage.from('documents').download(doc.storage_path);
  if (error || !file) return new NextResponse('Documento indisponível.', { status:404 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = String(doc.title || 'documento').replace(/[\r\n\"]+/g, ' ').slice(0, 120);
  return new NextResponse(buffer, { headers: { 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename="${safeName}.pdf"` } });
}
