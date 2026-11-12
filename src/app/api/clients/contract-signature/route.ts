import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { parseContractSignedOn } from '@/lib/clientContractSignatureDate';

export const runtime = 'nodejs';

function redirectToClient(req: Request, clientId: string, status: 'salva' | 'erro') {
  const url = new URL('/app/clientes/' + encodeURIComponent(clientId), req.url);
  if (status === 'salva') url.searchParams.set('assinatura', 'salva');
  else url.searchParams.set('assinatura_erro', '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const form = await req.formData();
  const clientId = String(form.get('client_id') || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 });
  }

  let signedOn: string | null;
  try {
    signedOn = parseContractSignedOn(form.get('contract_signed_on'));
  } catch {
    return redirectToClient(req, clientId, 'erro');
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .update({ contract_signed_on: signedOn, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('law_firm_id', profile.law_firm_id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Erro ao salvar data de assinatura do contrato:', error);
    return redirectToClient(req, clientId, 'erro');
  }
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  return redirectToClient(req, clientId, 'salva');
}
