import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { readJsonBody, SecurityError } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<LoginBody>(request, 16 * 1024);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password || email.length > 320 || password.length > 4096) {
      return NextResponse.json(
        { ok: false, error: 'Informe e-mail e senha.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { ok: false, error: 'E-mail ou senha inválidos.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // A sessão AAL1 já foi gravada nos cookies pelo createServerSupabase().
    // A tela de setup decide se o usuário deve cadastrar TOTP, informar um
    // código existente ou seguir direto caso a sessão já esteja em AAL2.
    return NextResponse.json(
      { ok: true, target: '/auth/mfa/setup' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof SecurityError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('Falha no login do AdvOS:', error);
    return NextResponse.json(
      { ok: false, error: 'Não foi possível concluir a autenticação. Tente novamente.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
