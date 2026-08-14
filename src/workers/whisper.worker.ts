/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers';

// Mantém o runtime ONNX/WASM no próprio domínio do AdvOS. Isso evita carregar
// código executável de CDN e mantém a CSP restrita. O postinstall copia esses arquivos.
if (env?.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/transformers/';
  env.backends.onnx.wasm.numThreads = 1;
}

const MODEL_ID = 'Xenova/whisper-base';
let transcriberPromise: Promise<any> | null = null;

function normalizeProgress(progress: any) {
  const status = String(progress?.status || '').toLowerCase();
  const file = String(progress?.file || '');
  const percent = Number(progress?.progress);

  if (status === 'progress' && Number.isFinite(percent)) {
    return { stage: 'download', percent: Math.max(0, Math.min(100, Math.round(percent))), file };
  }
  if (status === 'ready') return { stage: 'ready', percent: 100, file };
  if (status === 'initiate' || status === 'download' || status === 'done') return { stage: status, file };
  return { stage: status || 'loading', file };
}

async function getTranscriber(requestId: string) {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      progress_callback: (progress: any) => {
        self.postMessage({ type: 'progress', requestId, ...normalizeProgress(progress) });
      },
    }).catch((error: any) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

let workQueue: Promise<void> = Promise.resolve();

async function handleTranscription(data: any) {
  const requestId = String(data.requestId || '');
  try {
    const audio = data.audio instanceof Float32Array ? data.audio : new Float32Array(data.audio || []);
    if (!audio.length) throw new Error('O áudio preparado está vazio.');

    self.postMessage({ type: 'status', requestId, text: 'Carregando modelo de transcrição…' });
    const transcriber: any = await getTranscriber(requestId);
    self.postMessage({ type: 'status', requestId, text: 'Transcrevendo áudio no computador…' });

    const result: any = await transcriber(audio, {
      language: 'portuguese',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });

    const text = String(Array.isArray(result) ? result?.[0]?.text : result?.text || '').trim();
    if (!text) throw new Error('O modelo terminou, mas não encontrou fala reconhecível no áudio.');

    self.postMessage({ type: 'result', requestId, text, model: MODEL_ID });
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      requestId,
      error: String(error?.message || 'Não foi possível transcrever este áudio no navegador.'),
    });
  }
}

self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data || {};
  if (data.type !== 'transcribe') return;
  workQueue = workQueue.then(() => handleTranscription(data));
});

export {};
