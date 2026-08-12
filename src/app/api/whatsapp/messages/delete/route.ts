import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function str(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await req.json().catch(() => ({}));
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
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao apagar mensagem.' }, { status: 400 });
  }
}
