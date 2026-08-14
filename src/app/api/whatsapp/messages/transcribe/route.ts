import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';
import { assertSafeUploadedFile } from '@/lib/fileSecurity';
import { enforceRateLimit, publicErrorMessage, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_MODELS = new Set(['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']);

function str(value: unknown) {
  return String(value || '').trim();
}

function extensionForMime(mime: string) {
  const clean = str(mime).toLowerCase().split(';')[0].trim();
  if (clean === 'audio/mpeg' || clean === 'audio/mp3') return 'mp3';
  if (clean === 'audio/mp4') return 'mp4';
  if (clean === 'audio/m4a' || clean === 'audio/x-m4a') return 'm4a';
  if (clean === 'audio/webm') return 'webm';
  if (clean === 'audio/wav' || clean === 'audio/x-wav') return 'wav';
  return 'mp3';
}

function safeAudioName(name: string, mime: string) {
  const base = str(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'audio-whatsapp';
  if (/\.(mp3|mp4|m4a|wav|webm)$/i.test(base)) return base;
  return `${base.replace(/\.[^.]+$/, '')}.${extensionForMime(mime)}`;
}

export async function POST(req: Request) {
  const admin = createAdminSupabase();
  let messageId = '';
  let lawFirmId = '';

  try {
    const { session, profile } = await getCurrentProfile();
    lawFirmId = profile.law_firm_id;
    await enforceRateLimit(admin, `user:${session.user.id}:whatsapp-transcription`, 60, 3600, 'Muitas transcrições em pouco tempo. Aguarde e tente novamente.');

    const form = await req.formData();
    messageId = str(form.get('messageId'));
    const uploaded = form.get('file');
    if (!messageId) return NextResponse.json({ ok: false, error: 'Mensagem inválida.' }, { status: 400 });

    const { data: message, error: messageError } = await admin
      .from('whatsapp_messages')
      .select('id,law_firm_id,message_type,mime_type,file_name,transcription_text,transcription_status,transcription_model,transcribed_at')
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
        model: message.transcription_model || null,
        transcribed_at: message.transcribed_at || null,
      });
    }

    if (!(uploaded instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Não foi possível preparar o áudio para transcrição.' }, { status: 400 });
    }
    if (!uploaded.size) return NextResponse.json({ ok: false, error: 'O áudio está vazio.' }, { status: 400 });
    if (uploaded.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: 'O áudio ultrapassa o limite de 25 MB para transcrição.' }, { status: 413 });
    }

    const mimeType = str(uploaded.type || 'audio/mpeg').toLowerCase().split(';')[0].trim();
    const filename = safeAudioName(uploaded.name || message.file_name || 'audio-whatsapp', mimeType);
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    if (bytes.length > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: 'O áudio ultrapassa o limite de 25 MB para transcrição.' }, { status: 413 });
    }
    assertSafeUploadedFile(filename, mimeType, bytes);

    const integration = await getIntegrationConfig(lawFirmId, 'openai');
    const envFallback = !integration.row && Boolean(process.env.OPENAI_API_KEY);
    if (!integration.token || (!integration.configured && !envFallback)) {
      return NextResponse.json({ ok: false, error: 'Configure e ative a transcrição em Integrações antes de usar este recurso.' }, { status: 409 });
    }

    const configuredModel = str(integration.row?.raw_settings?.transcription_model);
    const model = ALLOWED_MODELS.has(configuredModel) ? configuredModel : 'gpt-transcribe';

    await admin
      .from('whatsapp_messages')
      .update({
        transcription_status: 'processing',
        transcription_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('law_firm_id', lawFirmId)
      .eq('id', messageId);

    const requestBody = new FormData();
    requestBody.set('model', model);
    requestBody.set('file', new Blob([bytes], { type: mimeType }), filename);
    requestBody.set('language', 'pt');
    requestBody.set('response_format', 'json');
    requestBody.set('prompt', 'Mensagem de voz de atendimento jurídico em português do Brasil. Transcreva fielmente, preservando nomes próprios, datas, valores, números de processos, CPF, CNPJ, telefones e termos jurídicos quando forem falados.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let response: Response;
    try {
      response = await fetch(`${integration.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${integration.token}` },
        body: requestBody,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      if (fetchError?.name === 'AbortError') {
        throw new SecurityError('A transcrição demorou mais de 90 segundos. Tente novamente.', 504);
      }
      throw new SecurityError('Não foi possível conectar à API de transcrição. Verifique a conexão e tente novamente.', 502);
    } finally {
      clearTimeout(timeout);
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = str(result?.error?.message);
      const requestId = str(response.headers.get('x-request-id'));
      console.error('OpenAI transcription error', { status: response.status, model, requestId, apiMessage });

      if (response.status === 401) throw new SecurityError('A chave da OpenAI foi recusada. Atualize a API Key em Integrações → Transcrição de áudios.', 401);
      if (response.status === 403) throw new SecurityError('A chave/projeto da OpenAI não tem permissão para usar o modelo de transcrição selecionado.', 403);
      if (response.status === 404) throw new SecurityError(`O modelo de transcrição ${model} não está disponível para esta conta. Troque o modelo em Integrações.`, 404);
      if (response.status === 413) throw new SecurityError('O arquivo de áudio é grande demais para a API de transcrição.', 413);
      if (response.status === 429) {
        const quota = /quota|billing|credit|insufficient/i.test(apiMessage);
        throw new SecurityError(quota
          ? 'A conta da OpenAI está sem cota/créditos disponíveis para transcrição. Verifique o faturamento da API.'
          : 'A OpenAI limitou temporariamente as transcrições. Aguarde um pouco e tente novamente.', 429);
      }
      if (response.status === 400 && /format|codec|audio|decode|file/i.test(apiMessage)) {
        throw new SecurityError('A API não conseguiu ler o formato deste áudio. Atualize a página e tente novamente; o AdvOS irá preparar uma versão WAV compatível.', 400);
      }
      throw new SecurityError(apiMessage ? `OpenAI: ${apiMessage}` : 'A API de transcrição recusou o áudio.', Math.max(400, Math.min(599, response.status || 400)));
    }

    const transcription = str(result?.text);
    if (!transcription) throw new Error('A transcrição foi concluída, mas nenhum texto foi retornado.');

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
      action: 'transcreveu_audio_whatsapp',
      entity: 'whatsapp_messages',
      entity_id: messageId,
    });
    await recordSecurityEvent({
      lawFirmId,
      authUserId: session.user.id,
      eventType: 'whatsapp_audio_transcribed',
      entity: 'whatsapp_messages',
      entityId: messageId,
      req,
      metadata: { model, bytes: bytes.length },
    });

    return NextResponse.json({ ok: true, cached: false, transcription, model, transcribed_at: transcribedAt });
  } catch (error: any) {
    console.error('Erro ao transcrever áudio do WhatsApp:', error);
    if (messageId && lawFirmId) {
      try {
        await admin
          .from('whatsapp_messages')
          .update({
            transcription_status: 'error',
            transcription_error: publicErrorMessage(error, 'Não foi possível transcrever o áudio.').slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('law_firm_id', lawFirmId)
          .eq('id', messageId);
      } catch {
        // A falha de auditoria do erro não deve esconder o erro principal da transcrição.
      }
    }
    if (error instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível transcrever o áudio.') }, { status: 400 });
  }
}
