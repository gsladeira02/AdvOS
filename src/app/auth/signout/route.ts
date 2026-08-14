import { type NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { recordSecurityEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function isSupabaseAuthCookie(name: string) {
  const normalized = String(name || '').toLowerCase();
  return normalized.startsWith('sb-') && (
    normalized.includes('auth-token') ||
    normalized.includes('auth-code-verifier')
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const admin = createAdminSupabase();
      const { data: profile } = await admin.from('profiles').select('law_firm_id').eq('auth_user_id', user.id).maybeSingle();
      await recordSecurityEvent({ lawFirmId: profile?.law_firm_id || null, authUserId: user.id, eventType: 'user_signed_out', entity: 'auth.sessions', req: request });
    }
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // A limpeza explícita abaixo funciona também quando a sessão já expirou.
  }

  // Sempre usa o mesmo domínio da requisição atual. Isso evita redirecionar para
  // um NEXT_PUBLIC_APP_URL antigo/diferente e parecer que o logout não funcionou.
  const response = NextResponse.redirect(new URL('/login?logout=1', request.url), 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    response.cookies.set(cookie.name, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  return response;
}
