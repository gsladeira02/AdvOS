'use client';

type WhisperResult = { text: string; model: string };
type ProgressCallback = (message: string) => void;
type Job = {
  resolve: (value: WhisperResult) => void;
  reject: (reason?: any) => void;
  onProgress?: ProgressCallback;
};

let worker: Worker | null = null;
const jobs = new Map<string, Job>();

function progressLabel(data: any) {
  if (data?.type === 'status' && data?.text) return String(data.text);
  if (data?.type !== 'progress') return '';
  const stage = String(data?.stage || '');
  const percent = Number(data?.percent);
  if (stage === 'progress' || stage === 'download') {
    return Number.isFinite(percent) ? `Baixando modelo de transcrição… ${Math.round(percent)}%` : 'Baixando modelo de transcrição…';
  }
  if (stage === 'ready') return 'Modelo carregado. Preparando transcrição…';
  if (stage === 'initiate' || stage === 'loading') return 'Preparando modelo de transcrição…';
  return '';
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data || {};
    const requestId = String(data.requestId || '');
    const job = jobs.get(requestId);
    if (!job) return;

    const label = progressLabel(data);
    if (label) job.onProgress?.(label);

    if (data.type === 'result') {
      jobs.delete(requestId);
      job.resolve({ text: String(data.text || '').trim(), model: String(data.model || 'Xenova/whisper-base') });
    } else if (data.type === 'error') {
      jobs.delete(requestId);
      job.reject(new Error(String(data.error || 'Não foi possível transcrever este áudio no navegador.')));
    }
  });
  worker.addEventListener('error', (event: ErrorEvent) => {
    const error = new Error(event.message || 'O mecanismo local de transcrição não pôde ser iniciado.');
    jobs.forEach((job) => job.reject(error));
    jobs.clear();
    try { worker?.terminate(); } catch {}
    worker = null;
  });
  return worker;
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = Boolean((window.navigator as any)?.standalone);
  return Boolean(displayMode || iosStandalone);
}

export function transcribeInBrowser(audio: Float32Array, onProgress?: ProgressCallback): Promise<WhisperResult> {
  if (isStandalonePwa()) return Promise.reject(new Error('A transcrição está disponível apenas no navegador desktop, não no PWA.'));
  if (typeof window !== 'undefined' && window.innerWidth < 768) return Promise.reject(new Error('A transcrição local está disponível apenas no navegador desktop.'));
  if (!audio?.length) return Promise.reject(new Error('O áudio preparado está vazio.'));

  const requestId = `whisper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    jobs.set(requestId, { resolve, reject, onProgress });
    const activeWorker = ensureWorker();
    try {
      activeWorker.postMessage({ type: 'transcribe', requestId, audio }, [audio.buffer]);
    } catch (error) {
      jobs.delete(requestId);
      reject(error);
    }
  });
}
