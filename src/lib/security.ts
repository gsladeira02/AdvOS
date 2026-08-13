import { createHmac, timingSafeEqual } from 'node:crypto';

export class SecurityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SecurityError';
    this.status = status;
  }
}


export function assertContentLength(req: Request, maxBytes: number) {
  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SecurityError('Payload excede o limite permitido.', 413);
  }
}

export async function readRawBody(req: Request, maxBytes = 2 * 1024 * 1024) {
  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SecurityError('Payload excede o limite permitido.', 413);
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new SecurityError('Payload excede o limite permitido.', 413);
  }
  return raw;
}

export async function readJsonBody<T = any>(req: Request, maxBytes = 2 * 1024 * 1024): Promise<T> {
  const raw = await readRawBody(req, maxBytes);
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new SecurityError('JSON inválido.', 400);
  }
}

export function safeEqual(left?: string | null, right?: string | null) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  const signature = String(signatureHeader || '').trim();
  if (!signature.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(signature, expected);
}

export function safeInternalPath(value: string | null | undefined, fallback: string) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  return path;
}
