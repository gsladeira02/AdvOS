import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';

function str(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 32768);
    const messageId = str(body.messageId);
    const conversationId = str(body.conversationId);
    const scope = str(body.scope);
    const admin = createAdminSupabase();

    if (scope === 'conversation' && conversationId) {
      const { error } = await admin
        .from('whatsapp_messages')
        .update({ deleted_at: new Date().toISOString(), deleted_by: session.user.id })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (!messageId) throw new Error('Mensagem não informada.');
    const { error } = await admin
      .from('whatsapp_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: session.user.id })
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', messageId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Erro ao apagar mensagem.') }, { status });
  }
}
