import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { readJsonBody, readRawBody, SecurityError } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginBody = {
  email?: string;
  password?: string;
};

function loginRedirect(request: Request, error?: 'missing' | 'invalid' | 'origin' | 'timeout' | 'server' | 'unauthorized' | 'inactive') {
  const url = new URL('/login', request.url);
  if (error) url.searchParams.set('error', error);
  return NextResponse.redirect(url, 303);
}

async function parseLoginBody(request: Request): Promise<LoginBody> {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return readJsonBody<LoginBody>(request, 16 * 1024);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(request, 16 * 1024);
    const params = new URLSearchParams(raw);
    return {
      email: params.get('email') || '',
      password: params.get('password') || '',
    };
  }

  throw new SecurityError('Formato de login não suportado.', 415);
}

export async function POST(request: Request) {
  try {
    const body = await parseLoginBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password || email.length > 320 || password.length > 4096) {
      return loginRedirect(request, 'missing');
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      return loginRedirect(request, 'invalid');
    }

    // Confere autorização interna logo após a senha.
    const admin = createAdminSupabase();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id,status')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut().catch(() => null);
      return loginRedirect(request, 'unauthorized');
    }

    if (String(profile.status || '').toLowerCase() !== 'ativo') {
      await supabase.auth.signOut().catch(() => null);
      return loginRedirect(request, 'inactive');
    }

    return NextResponse.redirect(new URL('/app/dashboard', request.url), 303);
  } catch (error) {
    if (error instanceof SecurityError) {
      if (error.status === 403) return loginRedirect(request, 'origin');
      return loginRedirect(request, 'server');
    }

    console.error('Falha no login do AdvOS:', error);
    return loginRedirect(request, 'server');
  }
}
