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

export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof SecurityError) return error.message;
  const message = String((error as any)?.message || '').trim();
  if (!message) return fallback;

  // Evita devolver detalhes de Postgres/PostgREST/Storage/stack ao navegador.
  if (/\b(?:PGRST\d+|Postgres|PostgreSQL|relation |column |constraint |duplicate key|violates |permission denied|row-level|RLS|schema cache|SQLSTATE|JWT|service_role|stack trace)\b/i.test(message)) {
    return fallback;
  }
  if (message.length > 600) return fallback;
  return message;
}

export async function enforceRateLimit(
  admin: any,
  key: string,
  limit: number,
  windowSeconds: number,
  message = 'Muitas tentativas. Aguarde um pouco e tente novamente.'
) {
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
  const safeWindow = Math.max(1, Math.min(86400, Math.floor(windowSeconds)));
  const { data, error } = await admin.rpc('advos_consume_rate_limit', {
    p_key: String(key || '').slice(0, 240),
    p_limit: safeLimit,
    p_window_seconds: safeWindow,
  });
  if (error) {
    console.error('Falha no rate limit de segurança:', error);
    // Fail closed apenas para operações sensíveis que optaram por este helper.
    throw new SecurityError('Não foi possível validar o limite de segurança.', 503);
  }
  if (data !== true) throw new SecurityError(message, 429);
}

export function assertTrustedMetaMediaUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new SecurityError('URL de mídia inválida.', 502);
  }
  const host = parsed.hostname.toLowerCase();
  const trusted = host === 'fbsbx.com' || host.endsWith('.fbsbx.com') || host === 'facebook.com' || host.endsWith('.facebook.com');
  if (parsed.protocol !== 'https:' || !trusted || parsed.username || parsed.password) {
    throw new SecurityError('Origem da mídia não autorizada.', 502);
  }
  return parsed.toString();
}
