'use client';

import { createBrowserSupabase } from '@/lib/supabase/browser';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const AUTH_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, ms = AUTH_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function Login() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password })
      );

      if (signInError || !data.session) {
        setError('E-mail ou senha inválidos.');
        return;
      }

      // A tela de login não faz mais uma segunda consulta Auth para decidir o MFA.
      // Isso evita locks/deadlocks e deixa o fluxo determinístico. A página /auth/mfa
      // decide entre desafio TOTP, primeiro cadastro do autenticador ou dashboard.
      window.location.replace('/auth/mfa');
    } catch (err: any) {
      if (String(err?.message || '') === 'AUTH_TIMEOUT') {
        setError('A autenticação demorou mais que o esperado. Verifique sua conexão e tente novamente.');
      } else {
        setError('Não foi possível concluir a autenticação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-6 sm:px-6">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-xl font-black text-white">A</div>
          <div>
            <b className="text-xl">AdvOS</b>
            <p className="text-xs font-bold text-slate-500">Acesso interno</p>
          </div>
        </Link>
        <h1 className="text-3xl font-black">Entrar</h1>
        <p className="mt-2 text-slate-600">Use seu e-mail e a senha cadastrados no AdvOS.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-center text-[11px] font-bold text-slate-500">Após a senha, o AdvOS solicita a autenticação em duas etapas.</p>
      </div>
    </main>
  );
}
