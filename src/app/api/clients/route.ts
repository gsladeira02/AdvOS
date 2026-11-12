import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOrCreateConversation } from '@/lib/whatsappApi';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { parseContractSignedOn } from '@/lib/clientContractSignatureDate';

function clean(v: FormDataEntryValue | null) {
  const value = String(v || '').trim();
  return value || null;
}

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const f = await req.formData();

  const name = clean(f.get('name'));
  if (!name) return NextResponse.redirect(new URL('/app/clientes?erro=nome', req.url), 303);

  const phone = clean(f.get('phone'));
  const whatsapp = clean(f.get('whatsapp'));
  let contractSignedOn: string | null;
  try {
    contractSignedOn = parseContractSignedOn(f.get('contract_signed_on'));
  } catch {
    return NextResponse.redirect(new URL('/app/clientes?erro=data_assinatura', req.url), 303);
  }

  const { data: client, error } = await admin.from('clients').insert({
    law_firm_id: profile.law_firm_id,
    name,
    doc: clean(f.get('doc')),
    client_type: clean(f.get('client_type')),
    phone,
    whatsapp,
    email: clean(f.get('email')),
    address: clean(f.get('address')),
    naturalidade: clean(f.get('naturalidade'))?.slice(0, 120) || null,
    civil_status: clean(f.get('civil_status'))?.slice(0, 120) || null,
    profession: clean(f.get('profession'))?.slice(0, 160) || null,
    rg: clean(f.get('rg'))?.slice(0, 40) || null,
    rg_uf: clean(f.get('rg_uf'))?.slice(0, 60) || null,
    notes: clean(f.get('notes')),
    contract_signed_on: contractSignedOn,
    service_id: clean(f.get('service_id')),
  }).select('id,name,phone,whatsapp').single();

  if (error) {
    console.error('Erro ao salvar cliente:', error);
    return NextResponse.redirect(new URL('/app/clientes?erro=salvar', req.url), 303);
  }

  const contactPhone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
  if (client?.id && contactPhone) {
    try {
      await getOrCreateConversation({ lawFirmId: profile.law_firm_id, clientId: client.id, phone: contactPhone, leadName: client.name });
    } catch (conversationError) {
      console.error('Erro ao criar conversa do cliente:', conversationError);
    }
  }

  return NextResponse.redirect(new URL('/app/clientes?salvo=1', req.url), 303);
}
