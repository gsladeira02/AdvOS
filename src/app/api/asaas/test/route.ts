import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const config = await getIntegrationConfig(profile.law_firm_id, 'asaas');

  if (!config.configured) {
    return NextResponse.redirect(new URL('/app/integracoes?asaas=sem_chave', req.url), 303);
  }

  try {
    const response = await fetch(`${config.baseUrl}/customers?limit=1`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'User-Agent': 'AdvOS',
        access_token: config.token,
      },
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.errors?.[0]?.description || json?.message || 'Não foi possível conectar ao Asaas.';
      await admin.from('integration_settings').update({
        status: 'erro',
        notes: message,
        updated_at: new Date().toISOString(),
      }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');
      return NextResponse.redirect(new URL('/app/integracoes?asaas=erro_teste', req.url), 303);
    }

    await admin.from('integration_settings').update({
      status: 'testado',
      notes: 'Conexão com Asaas testada com sucesso.',
      updated_at: new Date().toISOString(),
    }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'testou_integracao_asaas',
      entity: 'integration_settings',
    });

    return NextResponse.redirect(new URL('/app/integracoes?asaas=testado', req.url), 303);
  } catch (error: any) {
    await admin.from('integration_settings').update({
      status: 'erro',
      notes: error?.message || 'Erro desconhecido ao testar Asaas.',
      updated_at: new Date().toISOString(),
    }).eq('law_firm_id', profile.law_firm_id).eq('provider', 'asaas');
    return NextResponse.redirect(new URL('/app/integracoes?asaas=erro_teste', req.url), 303);
  }
}
