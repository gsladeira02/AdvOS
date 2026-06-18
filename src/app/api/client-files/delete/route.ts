import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function str(v: FormDataEntryValue | null) { return String(v || '').trim(); }

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const documentId = str(form.get('document_id'));
  const clientId = str(form.get('client_id'));

  if (!documentId || !clientId) {
    return NextResponse.redirect(new URL(clientId ? `/app/clientes/${clientId}?delete_error=1` : '/app/clientes', req.url), 303);
  }

  const admin = createAdminSupabase();
  const { data: doc } = await admin
    .from('documents')
    .select('id,storage_path')
    .eq('id', documentId)
    .eq('client_id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!doc) return NextResponse.redirect(new URL(`/app/clientes/${clientId}?delete_error=1`, req.url), 303);

  if (doc.storage_path) {
    await admin.storage.from('documents').remove([doc.storage_path]).catch(() => null);
  }

  await admin
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('client_id', clientId)
    .eq('law_firm_id', profile.law_firm_id);

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: profile.auth_user_id,
    action: 'apagou_documento_cliente',
    entity: 'documents',
    entity_id: documentId,
  });

  return NextResponse.redirect(new URL(`/app/clientes/${clientId}?deleted=1`, req.url), 303);
}
