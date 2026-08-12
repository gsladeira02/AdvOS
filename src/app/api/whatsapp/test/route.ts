import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getWhatsAppConfig } from '@/lib/whatsappApi';

export async function POST(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const config = await getWhatsAppConfig(profile.law_firm_id);

    if (!config.enabled || !config.token || !config.phoneNumberId) {
      return NextResponse.redirect(new URL('/app/integracoes?whatsapp=sem_chave', req.url), 303);
    }

    const response = await fetch(`${config.baseUrl}/${config.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const payload = await response.json().catch(() => ({}));
    const admin = createAdminSupabase();

    await admin
      .from('integration_settings')
      .update({
        status: response.ok ? 'testado' : 'erro_teste',
        notes: response.ok ? `Número conectado: ${payload?.display_phone_number || payload?.verified_name || config.phoneNumberId}` : JSON.stringify(payload?.error || payload).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('law_firm_id', profile.law_firm_id)
      .eq('provider', 'whatsapp');

    return NextResponse.redirect(new URL(`/app/integracoes?whatsapp=${response.ok ? 'testado' : 'erro_teste'}`, req.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/app/integracoes?whatsapp=erro_teste', req.url), 303);
  }
}
