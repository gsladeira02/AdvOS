import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendWhatsAppReaction } from '@/lib/whatsappApi';
import { readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';

function str(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 32768);
    const messageId = str(body.messageId);
    const emoji = str(body.emoji);
    if (!messageId) throw new Error('Mensagem não informada.');

    try {
      const result = await sendWhatsAppReaction({
        lawFirmId: profile.law_firm_id,
        messageId,
        emoji,
        reactedBy: session.user.id,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (metaError: any) {
      // Mantém a reação visual no AdvOS se a Meta recusar por janela, mensagem sem wamid, ou permissão.
      const admin = createAdminSupabase();
      const { data, error } = await admin
        .from('whatsapp_messages')
        .update({
          reaction_emoji: emoji || null,
          reacted_at: emoji ? new Date().toISOString() : null,
          reaction_by: session.user.id,
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', messageId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, localOnly: true, warning: metaError?.message || 'Reação salva apenas no AdvOS.', message: data });
    }
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Erro ao reagir mensagem.') }, { status });
  }
}
