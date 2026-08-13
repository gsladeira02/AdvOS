import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { readJsonBody, SecurityError } from '@/lib/security';
import { sendWhatsAppStructured } from '@/lib/whatsappApi';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const allowedKinds = new Set(['location', 'poll', 'event', 'call_permission', 'call_cta']);

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 131072);
    const kind = String(body.kind || '').trim();
    if (!allowedKinds.has(kind)) return NextResponse.json({ ok: false, error: 'Tipo não suportado.' }, { status: 400 });

    const result = await sendWhatsAppStructured({
      lawFirmId: profile.law_firm_id,
      to: String(body.phone || body.to || '').trim(),
      kind: kind as any,
      data: body.data && typeof body.data === 'object' ? body.data : {},
      clientId: String(body.client_id || body.clientId || '').trim() || null,
      sentBy: session.user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar recurso do WhatsApp.' }, { status });
  }
}
