import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, SecurityError, publicErrorMessage } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

function str(value: any) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await readJsonBody(req, 32768);
    const messageId = str(body.messageId);
    const conversationId = str(body.conversationId);
    const scope = str(body.scope || 'for_me');
    const admin = createAdminSupabase();

    if (scope === 'conversation' && conversationId) {
      const { error } = await admin
        .from('whatsapp_messages')
        .update({ deleted_at: new Date().toISOString(), deleted_by: session.user.id, deleted_for_all: true })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, scope: 'conversation' });
    }

    if (!messageId) throw new SecurityError('Mensagem não informada.', 400);

    const { data: message, error: messageError } = await admin
      .from('whatsapp_messages')
      .select('id,conversation_id,direction,external_id,deleted_at')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message?.id) throw new SecurityError('Mensagem não encontrada.', 404);

    if (scope === 'for_me') {
      const { error } = await admin.from('whatsapp_message_user_hides').upsert({
        law_firm_id: profile.law_firm_id,
        message_id: messageId,
        auth_user_id: session.user.id,
      }, { onConflict: 'message_id,auth_user_id', ignoreDuplicates: true });
      if (error) throw error;

      await recordSecurityEvent({
        lawFirmId: profile.law_firm_id,
        authUserId: session.user.id,
        eventType: 'whatsapp.message_hidden_for_user',
        entity: 'whatsapp_message',
        entityId: messageId,
        req,
      });
      return NextResponse.json({ ok: true, scope: 'for_me' });
    }

    if (scope === 'for_everyone') {
      const { error } = await admin
        .from('whatsapp_messages')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: session.user.id,
          deleted_for_all: true,
          updated_at: new Date().toISOString(),
        })
        .eq('law_firm_id', profile.law_firm_id)
        .eq('id', messageId);
      if (error) throw error;

      await recordSecurityEvent({
        lawFirmId: profile.law_firm_id,
        authUserId: session.user.id,
        eventType: 'whatsapp.message_deleted_for_office',
        entity: 'whatsapp_message',
        entityId: messageId,
        req,
        metadata: {
          direction: message.direction || null,
          external_id: message.external_id || null,
          meta_remote_delete_supported: false,
        },
      });

      return NextResponse.json({
        ok: true,
        scope: 'for_everyone',
        remoteDeleted: false,
        warning: 'A mensagem foi apagada para todos no AdvOS. A API oficial da Meta não permite que o AdvOS remova retroativamente a mensagem do WhatsApp do cliente.',
      });
    }

    throw new SecurityError('Opção de exclusão inválida.', 400);
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Erro ao apagar mensagem.') }, { status });
  }
}
