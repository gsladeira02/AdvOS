import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getWhatsAppConfig } from '@/lib/whatsappApi';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { readJsonBody, SecurityError } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function graphMessage(payload: any) {
  return payload?.error?.error_data?.details || payload?.error?.message || payload?.message || 'Erro na Calling API do WhatsApp.';
}

function allCallNodes(payload: any) {
  const calls: any[] = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const call of change?.value?.calls || []) calls.push(call);
    }
  }
  return calls;
}

export async function GET(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const url = new URL(req.url);
    const callId = String(url.searchParams.get('callId') || '').trim();
    const correlationId = String(url.searchParams.get('correlationId') || '').trim();

    if (callId || correlationId) {
      const admin = createAdminSupabase();
      const { data, error } = await admin
        .from('webhook_events')
        .select('id,payload,created_at')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('provider', 'whatsapp')
        .eq('event_type', 'calls')
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw new Error(error.message);

      const matches: Array<{ call: any; createdAt: string }> = [];
      for (const row of data || []) {
        for (const call of allCallNodes(row.payload)) {
          const sameCall = callId && String(call?.id || '') === callId;
          const sameCorrelation = correlationId && String(call?.biz_opaque_callback_data || '') === correlationId;
          if (sameCall || sameCorrelation) matches.push({ call, createdAt: row.created_at });
        }
      }
      const terminal = matches.find(({ call }) => /terminate|reject|failed/i.test(String(call?.event || call?.status || '')));
      if (terminal) return NextResponse.json({ ok: true, ...terminal });
      const withSdp = matches.find(({ call }) => Boolean(call?.session?.sdp));
      if (withSdp) return NextResponse.json({ ok: true, ...withSdp });
      if (matches[0]) return NextResponse.json({ ok: true, ...matches[0] });
      return NextResponse.json({ ok: true, call: null });
    }

    const phone = normalizeBrazilPhone(String(url.searchParams.get('phone') || ''));
    const config = await getWhatsAppConfig(profile.law_firm_id);
    if (!config.configured) throw new Error('WhatsApp API não configurado.');

    const headers = { Authorization: `Bearer ${config.token}` };
    const settingsResponse = await fetch(`${config.baseUrl}/${config.phoneNumberId}/settings`, { headers, cache: 'no-store' });
    const settings = await settingsResponse.json().catch(() => ({}));

    let permission: any = null;
    if (phone) {
      const permissionResponse = await fetch(`${config.baseUrl}/${config.phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(phone)}`, { headers, cache: 'no-store' });
      permission = await permissionResponse.json().catch(() => ({}));
    }

    return NextResponse.json({
      ok: true,
      callingAvailable: settingsResponse.ok,
      settings,
      permission,
    });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao consultar Calling API.' }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 262144);
    const action = String(body.action || '').trim();
    const config = await getWhatsAppConfig(profile.law_firm_id);
    if (!config.configured) throw new Error('WhatsApp API não configurado.');

    let graphBody: any;
    if (action === 'connect') {
      const phone = normalizeBrazilPhone(String(body.phone || body.to || ''));
      const sdp = String(body.sdp || '');
      if (!phone) throw new Error('Telefone inválido.');
      if (!sdp || sdp.length > 220000) throw new Error('SDP da chamada inválido.');
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        action: 'connect',
        session: { sdp_type: 'offer', sdp },
        biz_opaque_callback_data: String(body.correlationId || '').slice(0, 512) || undefined,
      };
    } else if (action === 'terminate') {
      const callId = String(body.callId || '').trim();
      if (!callId) throw new Error('Chamada não identificada.');
      graphBody = { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' };
    } else {
      return NextResponse.json({ ok: false, error: 'Ação de chamada inválida.' }, { status: 400 });
    }

    const response = await fetch(`${config.baseUrl}/${config.phoneNumberId}/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ ok: false, error: graphMessage(payload), meta: payload }, { status: 400 });
    const callId = payload?.calls?.[0]?.id || payload?.call_id || payload?.id || null;
    return NextResponse.json({ ok: true, callId, payload });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: error?.message || 'Erro na chamada.' }, { status });
  }
}
