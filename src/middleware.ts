import { NextRequest, NextResponse } from 'next/server';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isWebhook(pathname: string) {
  return pathname.startsWith('/api/webhooks/');
}

function maxBodyBytes(pathname: string) {
  if (pathname === '/api/client-files/upload') return 251 * 1024 * 1024;
  if (pathname === '/api/whatsapp/send-media') return 18 * 1024 * 1024;
  if (pathname === '/api/whatsapp/messages/transcribe') return 27 * 1024 * 1024;
  if (pathname === '/api/asaas/import') return 12 * 1024 * 1024;
  return 2 * 1024 * 1024;
}

function firstHeaderValue(value: string | null) {
  return String(value || '').split(',')[0]?.trim() || '';
}

function requestOrigin(request: NextRequest) {
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  const host = forwardedHost || firstHeaderValue(request.headers.get('host')) || request.nextUrl.host;
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));
  const protocol = forwardedProto || request.nextUrl.protocol.replace(':', '') || 'https';
  return `${protocol}://${host}`;
}

function sameOrigin(value: string, expectedOrigin: string) {
  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function mutationOriginAllowed(request: NextRequest) {
  const origin = String(request.headers.get('origin') || '').trim();
  const referer = String(request.headers.get('referer') || '').trim();
  const secFetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  const expectedOrigin = requestOrigin(request);

  if (secFetchSite === 'cross-site') return false;
  if (origin && origin !== 'null') return sameOrigin(origin, expectedOrigin);

  if (origin === 'null') {
    if (secFetchSite === 'same-origin') return true;
    if (referer && sameOrigin(referer, expectedOrigin)) return true;
    return false;
  }

  if (secFetchSite === 'same-origin') return true;
  if (referer) return sameOrigin(referer, expectedOrigin);
  return true;
}

function csp(nonce: string) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  let supabaseOrigin = '';
  let supabaseWs = '';
  try {
    const parsed = new URL(supabaseUrl);
    supabaseOrigin = parsed.origin;
    supabaseWs = parsed.origin.replace(/^http/, 'ws');
  } catch {}

  const connect = ["'self'", supabaseOrigin, supabaseWs].filter(Boolean).join(' ');
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const upgrade = process.env.NODE_ENV === 'production' ? '; upgrade-insecure-requests' : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' https://www.openstreetmap.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ') + upgrade;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  let response: NextResponse;

  if (!isWebhook(pathname) && MUTATING.has(request.method)) {
    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes(pathname)) {
      response = NextResponse.json({ error: 'Requisição muito grande.' }, { status: 413 });
      response.headers.set('Content-Security-Policy', policy);
      return response;
    }

    if (!mutationOriginAllowed(request)) {
      response = NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
      response.headers.set('Content-Security-Policy', policy);
      return response;
    }
  }

  response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|offline.html).*)',
  ],
};
