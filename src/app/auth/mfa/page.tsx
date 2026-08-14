'use client';

import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

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

function verifiedTotpFactors(data: any) {
  const candidates = [
    ...(Array.isArray(data?.totp) ? data.totp : []),
    ...(Array.isArray(data?.all) ? data.all : []),
  ];
  const seen = new Set<string>();
  return candidates.filter((factor: any) => {
    const id = String(factor?.id || '');
    const ok = id && String(factor?.factor_type || 'totp') === 'totp' && String(factor?.status || 'verified') === 'verified';
    if (!ok || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export default function MfaChallengePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await withTimeout(supabase.auth.getUser());
      if (!active) return;
      if (!user) return window.location.replace('/login');

      const assurance = await withTimeout(supabase.auth.mfa.getAuthenticatorAssuranceLevel());
      if (!active) return;
      if (assurance.data?.currentLevel === 'aal2') return window.location.replace('/app/dashboard');
      if (assurance.data?.nextLevel !== 'aal2') return window.location.replace('/auth/mfa/setup');

      const result = await withTimeout(supabase.auth.mfa.listFactors());
      const factors = verifiedTotpFactors(result?.data);
      if (!active) return;
      if (!factors.length) return window.location.replace('/auth/mfa/setup');
      setFactorId(String(factors[0].id));
      setLoading(false);
    })().catch((err: any) => {
      if (active) {
        setLoading(false);
        setError(String(err?.message || '') === 'AUTH_TIMEOUT'
          ? 'A verificação demorou mais que o esperado. Tente novamente.'
          : 'Não foi possível carregar o segundo fator.');
      }
    });
    return () => { active = false; };
  }, [supabase]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (!factorId || clean.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await withTimeout(supabase.auth.mfa.challengeAndVerify({ factorId, code: clean }));
      if (verifyError) {
        setError('Código inválido ou expirado. Tente novamente.');
        return;
      }
      window.location.replace('/app/dashboard');
    } catch (err: any) {
      setError(String(err?.message || '') === 'AUTH_TIMEOUT'
        ? 'A validação demorou mais que o esperado. Tente novamente.'
        : 'Não foi possível validar o código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => null);
    window.location.replace('/login');
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-white"><LockKeyhole size={23} /></div>
          <div><b className="text-xl">AdvOS</b><p className="text-sm font-bold text-slate-500">Verificação em duas etapas</p></div>
        </div>
        <h1 className="text-2xl font-black">Código do autenticador</h1>
        <p className="mt-2 text-sm text-slate-600">Abra seu aplicativo autenticador e informe o código atual.</p>
        <form className="mt-6 space-y-4" onSubmit={verify}>
          <input className="input text-center text-2xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={loading || code.length !== 6}>{loading ? 'Verificando...' : 'Verificar e entrar'}</button>
        </form>
        <button type="button" onClick={signOut} className="mt-5 w-full text-center text-xs font-bold text-slate-500 hover:text-red-700">Sair da conta</button>
      </div>
    </main>
  );
}
