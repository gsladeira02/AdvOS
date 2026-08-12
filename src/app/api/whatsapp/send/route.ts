import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { sendWhatsAppText } from '@/lib/whatsappApi';

function str(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await req.json().catch(() => ({}));

    const phone = str(body.phone || body.to);
    const message = str(body.message);
    const clientId = str(body.client_id || body.clientId) || null;

    const result = await sendWhatsAppText({
      lawFirmId: profile.law_firm_id,
      to: phone,
      message,
      clientId,
      sentBy: session.user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar WhatsApp.' }, { status: 400 });
  }
}
