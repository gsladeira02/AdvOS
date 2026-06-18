import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const f = await req.formData();
  const clientId = String(f.get('client_id') || '').trim();
  const serviceId = String(f.get('service_id') || '').trim() || null;

  if (clientId) {
    const { error } = await admin
      .from('clients')
      .update({ service_id: serviceId })
      .eq('id', clientId)
      .eq('law_firm_id', profile.law_firm_id);

    if (error) {
      console.error('Erro ao salvar serviço do cliente:', error);
      return NextResponse.redirect(new URL(`/app/clientes/${clientId}?erro=${encodeURIComponent(error.message)}`, req.url), 303);
    }
  }

  return NextResponse.redirect(new URL(`/app/clientes/${clientId}?servico=salvo`, req.url), 303);
}
