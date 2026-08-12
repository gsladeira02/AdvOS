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
    const messageId = str(body.messageId || body.message_id);
    const conversationId = str(body.conversationId || body.conversation_id);
    const scope = str(body.scope || 'message');

    if (!messageId && !conversationId) {
      throw new Error('Informe a mensagem ou a conversa que deseja apagar.');
    }

    const admin = createAdminSupabase();
    const patch = {
      deleted_at: new Date().toISOString(),
      deleted_by: session.user.id,
      deleted_for_all: false,
    };

    if (scope === 'conversation') {
      if (!conversationId) throw new Error('Conversa não informada.');
      const { error } = await admin
        .from('whatsapp_messages')
        .update(patch)
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId);
      if (error) throw new Error(error.message);

      await admin
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', conversationId);

      return NextResponse.json({ ok: true, deletedScope: 'conversation' });
    }

    const { error } = await admin
      .from('whatsapp_messages')
      .update(patch)
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', messageId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, deletedScope: 'message' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao apagar mensagem.' }, { status: 400 });
  }
}
