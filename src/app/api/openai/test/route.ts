import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig, tokenLast4 } from '@/lib/integrations';
import { enforceRateLimit, SecurityError } from '@/lib/security';
import { recordSecurityEvent } from '@/lib/audit';

const ALLOWED_MODELS = new Set(['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']);

function str(value: unknown) {
  return String(value || '').trim();
}

function makeSilentWav(durationSeconds = 1, sampleRate = 16000) {
  const samples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function redirect(req: Request, code: string) {
  return NextResponse.redirect(new URL(`/app/integracoes?openai=${encodeURIComponent(code)}`, req.url), 303);
}

export async function POST(req: Request) {
  const admin = createAdminSupabase();
  try {
    const { session, profile } = await getCurrentAdminProfile();
    await enforceRateLimit(admin, `user:${session.user.id}:openai-integration-test`, 12, 3600, 'Muitos testes de integração em pouco tempo. Aguarde e tente novamente.');

    const config = await getIntegrationConfig(profile.law_firm_id, 'openai');
    if (!config.token) return redirect(req, 'sem_chave');
    if (!config.enabled) return redirect(req, 'desativada');

    const configuredModel = str(config.row?.raw_settings?.transcription_model);
    const model = ALLOWED_MODELS.has(configuredModel) ? configuredModel : 'gpt-transcribe';
    const wav = makeSilentWav();
    const body = new FormData();
    body.set('model', model);
    body.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'advos-teste.wav');
    if (model === 'gpt-transcribe') body.append('languages[]', 'pt');
    else body.set('language', 'pt');
    body.set('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}` },
        body,
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = str(payload?.error?.message) || `HTTP ${response.status}`;
      await admin.from('integration_settings').upsert({
        law_firm_id: profile.law_firm_id,
        provider: 'openai',
        enabled: true,
        environment: 'producao',
        api_base_url: config.baseUrl,
        token_last4: tokenLast4(config.token),
        status: 'erro',
        notes: apiMessage.slice(0, 500),
        raw_settings: {
          ...(config.row?.raw_settings || {}),
          transcription_model: model,
          transcription_language: 'pt',
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'law_firm_id,provider' });

      if (response.status === 401) return redirect(req, 'chave_invalida');
      if (response.status === 403) return redirect(req, 'sem_permissao');
      if (response.status === 404) return redirect(req, 'modelo_indisponivel');
      if (response.status === 429) return redirect(req, /quota|billing|credit|insufficient/i.test(apiMessage) ? 'sem_creditos' : 'limite');
      return redirect(req, 'erro_teste');
    }

    await admin.from('integration_settings').upsert({
      law_firm_id: profile.law_firm_id,
      provider: 'openai',
      enabled: true,
      environment: 'producao',
      api_base_url: config.baseUrl,
      token_last4: tokenLast4(config.token),
      status: 'testado',
      notes: `Transcrição testada com sucesso usando ${model}.`,
      raw_settings: {
        ...(config.row?.raw_settings || {}),
        transcription_model: model,
        transcription_language: 'pt',
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'law_firm_id,provider' });

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'testou_integracao_openai_transcricao',
      entity: 'integration_settings',
    });
    await recordSecurityEvent({
      lawFirmId: profile.law_firm_id,
      authUserId: session.user.id,
      eventType: 'openai_transcription_integration_tested',
      entity: 'integration_settings',
      req,
      metadata: { model, tokenSource: config.tokenSource },
    });

    return redirect(req, 'testado');
  } catch (error: any) {
    console.error('Erro ao testar transcrição OpenAI:', error);
    if (error instanceof SecurityError) return redirect(req, 'limite');
    if (error?.name === 'AbortError') return redirect(req, 'timeout');
    return redirect(req, 'erro_teste');
  }
}
