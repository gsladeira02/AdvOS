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

function firstHeaderValue(value: string | null) {
  return String(value || '').split(',')[0]?.trim() || '';
}

function requestOrigin(request: NextRequest) {
  // Em proxies como a Vercel, priorizamos os headers encaminhados para comparar
  // com a origem pública real acessada pelo navegador.
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

  // Fetch Metadata é uma barreira adicional contra CSRF. Uma requisição que o
  // próprio navegador classifica como cross-site nunca deve gravar no AdvOS.
  if (secFetchSite === 'cross-site') return false;

  if (origin && origin !== 'null') {
    return sameOrigin(origin, expectedOrigin);
  }

  // `Origin: null` é permitido pelo padrão para origens opacas. Não o aceitamos
  // cegamente: só liberamos quando o navegador confirma same-origin ou quando
  // o Referer comprova o domínio do próprio AdvOS.
  if (origin === 'null') {
    if (secFetchSite === 'same-origin') return true;
    if (referer && sameOrigin(referer, expectedOrigin)) return true;
    return false;
  }

  // Alguns contextos legítimos omitem Origin. Same-origin continua seguro e,
  // quando disponível, o Referer funciona como confirmação adicional.
  if (secFetchSite === 'same-origin') return true;
  if (referer) return sameOrigin(referer, expectedOrigin);

  // Requisições sem Origin/Referer/Fetch-Metadata podem ser chamadas internas
  // ou ferramentas autenticadas. As próprias rotas continuam exigindo sessão.
  return true;
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

    if (!mutationOriginAllowed(request)) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/auth/signout'],
};
