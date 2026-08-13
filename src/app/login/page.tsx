'use client';

import { createBrowserSupabase } from '@/lib/supabase/browser';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function pwaTarget() {
  if (typeof window === 'undefined') return '/app/dashboard';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any)?.standalone;
  return standalone ? '/app/whatsapp' : '/app/dashboard';
}

export default function Login() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        window.location.replace(pwaTarget());
        return;
      }
      setCheckingSession(false);
    }).catch(() => setCheckingSession(false));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        window.location.replace(pwaTarget());
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('E-mail ou senha inválidos.');
      return;
    }
    window.location.replace(pwaTarget());
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="card w-full max-w-md p-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-xl font-black text-white">A</div>
          <div>
            <b className="text-xl">AdvOS</b>
            <p className="text-xs font-bold text-slate-500">Acesso interno</p>
          </div>
        </Link>
        <h1 className="text-3xl font-black">Entrar</h1>
        <p className="mt-2 text-slate-600">Use o usuário criado no Supabase ou dentro do painel.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading || checkingSession}>
            {checkingSession ? 'Verificando sessão...' : loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-center text-[11px] font-bold text-slate-500">No PWA, sua sessão fica salva enquanto você não clicar em sair.</p>
      </div>
    </main>
  );
}
