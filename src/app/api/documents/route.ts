import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function str(value: FormDataEntryValue | null) {
  return String(value || '').trim();
}

function safeHttpsUrl(value: FormDataEntryValue | null) {
  const raw = str(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const clientId = str(f.get('client_id')) || null;
  const caseId = str(f.get('case_id')) || null;

  if (clientId) {
    const { data } = await admin.from('clients').select('id').eq('law_firm_id', profile.law_firm_id).eq('id', clientId).maybeSingle();
    if (!data?.id) return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 });
  }
  if (caseId) {
    const { data } = await admin.from('cases').select('id').eq('law_firm_id', profile.law_firm_id).eq('id', caseId).maybeSingle();
    if (!data?.id) return NextResponse.json({ error: 'Processo inválido.' }, { status: 400 });
  }

  const rawExternalUrl = str(f.get('external_url'));
  const externalUrl = safeHttpsUrl(f.get('external_url'));
  if (rawExternalUrl && !externalUrl) {
    return NextResponse.json({ error: 'A URL externa deve usar HTTPS.' }, { status: 400 });
  }

  const { error } = await admin.from('documents').insert({
    law_firm_id: profile.law_firm_id,
    client_id: clientId,
    case_id: caseId,
    title: str(f.get('title')),
    doc_type: str(f.get('doc_type')),
    external_url: externalUrl,
    notes: str(f.get('notes')) || null,
  });
  if (error) return NextResponse.json({ error: 'Não foi possível salvar os dados.' }, { status: 400 });
  return NextResponse.redirect(new URL('/app/documentos', req.url), 303);
}
