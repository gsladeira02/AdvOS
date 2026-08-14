'use client';

import Link from 'next/link';
import { useState } from 'react';

const LOGIN_TIMEOUT_MS = 15000;

type LoginResponse = {
  ok?: boolean;
  target?: string;
  error?: string;
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Informe e-mail e senha.');
      return;
    }

    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      let payload: LoginResponse = {};
      try {
        payload = (await response.json()) as LoginResponse;
      } catch {
        payload = {};
      }

      if (!response.ok || payload.ok !== true) {
        setError(payload.error || 'Não foi possível entrar. Confira seus dados e tente novamente.');
        return;
      }

      // Navegação completa para garantir que o próximo request já leia os
      // cookies de autenticação gravados pelo servidor.
      const target =
        typeof payload.target === 'string' && payload.target.startsWith('/') && !payload.target.startsWith('//')
          ? payload.target
          : '/auth/mfa/setup';

      window.location.assign(target);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('A autenticação demorou mais que o esperado. Tente novamente.');
      } else {
        setError('Não foi possível conectar ao servidor do AdvOS. Tente novamente.');
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-6 sm:px-6">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-black text-white">
            A
          </div>
          <div className="min-w-0">
            <b className="block text-xl leading-relaxed">AdvOS</b>
            <p className="text-xs font-bold leading-relaxed text-slate-500">Acesso interno</p>
          </div>
        </Link>

        <h1 className="text-3xl font-black leading-relaxed">Entrar</h1>
        <p className="mt-2 leading-relaxed text-slate-600">
          Use seu e-mail e a senha cadastrados no AdvOS.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input
              id="email"
              className="input mt-1"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError('');
              }}
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Senha</label>
            <input
              id="password"
              className="input mt-1"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] font-bold leading-relaxed text-slate-500">
          Após a senha, o AdvOS solicita a autenticação em duas etapas.
        </p>
      </div>
    </main>
  );
}
