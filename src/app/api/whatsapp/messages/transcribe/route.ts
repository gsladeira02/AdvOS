import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit, publicErrorMessage, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TRANSCRIPTION_CHARS = 120000;

function str(value: unknown) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  const admin = createAdminSupabase();
  try {
    const { session, profile } = await getCurrentProfile();
    const lawFirmId = profile.law_firm_id;
    await enforceRateLimit(admin, `user:${session.user.id}:whatsapp-transcription-save`, 120, 3600, 'Muitas transcrições em pouco tempo. Aguarde e tente novamente.');

    const contentType = String(req.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ ok: false, error: 'Atualize o AdvOS. A transcrição agora é feita diretamente no navegador.' }, { status: 415 });
    }

    const body = await req.json().catch(() => ({}));
    const messageId = str(body?.messageId);
    const transcription = str(body?.transcription);
    const model = str(body?.model || 'Xenova/whisper-base').slice(0, 120);

    if (!messageId) return NextResponse.json({ ok: false, error: 'Mensagem inválida.' }, { status: 400 });
    if (!transcription) return NextResponse.json({ ok: false, error: 'A transcrição está vazia.' }, { status: 400 });
    if (transcription.length > MAX_TRANSCRIPTION_CHARS) {
      return NextResponse.json({ ok: false, error: 'A transcrição ultrapassou o limite de texto permitido.' }, { status: 413 });
    }

    const { data: message, error: messageError } = await admin
      .from('whatsapp_messages')
      .select('id,law_firm_id,message_type,mime_type,transcription_text,transcription_model,transcribed_at')
      .eq('law_firm_id', lawFirmId)
      .eq('id', messageId)
      .maybeSingle();

    if (messageError) {
      const databaseMessage = str(messageError.message);
      if (/transcription_(?:text|status|model|error)|transcribed_(?:at|by)/i.test(databaseMessage) || /schema cache/i.test(databaseMessage)) {
        throw new SecurityError('A estrutura de transcrição ainda não está pronta no Supabase. Rode o SQL supabase/v9_64_transcricao_audio_hotfix.sql e tente novamente.', 409);
      }
      throw new Error(databaseMessage || 'Não foi possível consultar a mensagem.');
    }
    if (!message?.id) return NextResponse.json({ ok: false, error: 'Áudio não encontrado.' }, { status: 404 });

    const messageType = str(message.message_type).toLowerCase();
    const messageMime = str(message.mime_type).toLowerCase();
    if (messageType !== 'audio' && !messageMime.startsWith('audio/')) {
      return NextResponse.json({ ok: false, error: 'A mensagem selecionada não é um áudio.' }, { status: 400 });
    }

    if (str(message.transcription_text)) {
      return NextResponse.json({
        ok: true,
        cached: true,
        transcription: message.transcription_text,
        model: message.transcription_model || model,
        transcribed_at: message.transcribed_at || null,
      });
    }

    const transcribedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('whatsapp_messages')
      .update({
        transcription_text: transcription,
        transcription_status: 'completed',
        transcription_model: model,
        transcription_error: null,
        transcribed_at: transcribedAt,
        transcribed_by: session.user.id,
        updated_at: transcribedAt,
      })
      .eq('law_firm_id', lawFirmId)
      .eq('id', messageId);
    if (updateError) throw new Error(updateError.message);

    await admin.from('activity_logs').insert({
      law_firm_id: lawFirmId,
      auth_user_id: session.user.id,
      action: 'transcreveu_audio_whatsapp_no_navegador',
      entity: 'whatsapp_messages',
      entity_id: messageId,
    });
    await recordSecurityEvent({
      lawFirmId,
      authUserId: session.user.id,
      eventType: 'whatsapp_audio_transcribed_in_browser',
      entity: 'whatsapp_messages',
      entityId: messageId,
      req,
      metadata: { model, chars: transcription.length, processing: 'browser-local' },
    });

    return NextResponse.json({ ok: true, cached: false, transcription, model, transcribed_at: transcribedAt });
  } catch (error: any) {
    console.error('Erro ao salvar transcrição local do WhatsApp:', error);
    if (error instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível salvar a transcrição.') }, { status: 400 });
  }
}
