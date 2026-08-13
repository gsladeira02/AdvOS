import { NextRequest, NextResponse } from 'next/server';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isWebhook(pathname: string) {
  return pathname.startsWith('/api/webhooks/');
}

function maxBodyBytes(pathname: string) {
  if (pathname === '/api/client-files/upload') return 251 * 1024 * 1024;
  if (pathname === '/api/whatsapp/send-media') return 18 * 1024 * 1024;
  if (pathname === '/api/asaas/import') return 12 * 1024 * 1024;
  return 2 * 1024 * 1024;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Webhooks são chamadas servidor-servidor e possuem validação própria.
  if (isWebhook(pathname)) return NextResponse.next();

  if (MUTATING.has(request.method)) {
    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes(pathname)) {
      return NextResponse.json({ error: 'Requisição muito grande.' }, { status: 413 });
    }

    const origin = request.headers.get('origin');
    const secFetchSite = request.headers.get('sec-fetch-site');

    if (secFetchSite === 'cross-site') {
      return NextResponse.json({ error: 'Requisição bloqueada.' }, { status: 403 });
    }

    if (origin) {
      let originUrl: URL;
      try {
        originUrl = new URL(origin);
      } catch {
        return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
      }
      if (originUrl.origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/auth/signout'],
};
