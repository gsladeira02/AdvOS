'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export default function MfaSetupPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        window.location.replace('/login');
        return;
      }
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (data?.currentLevel === 'aal2') {
        window.location.replace('/app/dashboard');
        return;
      }
      if (data?.nextLevel === 'aal2') {
        window.location.replace('/auth/mfa');
        return;
      }
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => { active = false; };
  }, [supabase]);

  async function startEnrollment() {
    setError('');
    setEnrolling(true);

    // Tentativas anteriores interrompidas podem deixar fatores TOTP não verificados.
    // Removemos apenas esses rascunhos antes de criar um novo QR Code.
    try {
      const mfa: any = supabase.auth.mfa;
      const listed = await mfa.listFactors();
      const candidates = [
        ...(Array.isArray(listed?.data?.totp) ? listed.data.totp : []),
        ...(Array.isArray(listed?.data?.all) ? listed.data.all : []),
      ];
      const ids = new Set<string>();
      for (const factor of candidates) {
        const id = String(factor?.id || '');
        const type = String(factor?.factor_type || factor?.factorType || 'totp');
        const status = String(factor?.status || '');
        if (id && type === 'totp' && status === 'unverified' && !ids.has(id)) {
          ids.add(id);
          await mfa.unenroll({ factorId: id }).catch(() => null);
        }
      }
    } catch {}

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'AdvOS',
    });
    setEnrolling(false);
    if (enrollError || !data?.id || !data?.totp) {
      setError('Não foi possível iniciar a autenticação em dois fatores.');
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code || '');
    setSecret(data.totp.secret || '');
  }

  async function verify() {
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (!factorId || clean.length !== 6) {
      setError('Digite o código de 6 dígitos do aplicativo autenticador.');
      return;
    }
    setError('');
    setEnrolling(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
    setEnrolling(false);
    if (verifyError) {
      setError('Código inválido ou expirado. Confira o autenticador e tente novamente.');
      return;
    }
    window.location.replace('/app/dashboard');
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => null);
    window.location.replace('/login');
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <div className="card w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-white"><ShieldCheck size={24} /></div>
          <div><b className="text-xl">Segurança do AdvOS</b><p className="text-sm font-bold text-slate-500">Autenticação em dois fatores obrigatória</p></div>
        </div>

        <h1 className="text-2xl font-black">Proteja sua conta</h1>
        <p className="mt-2 text-sm text-slate-600">Use Google Authenticator, Microsoft Authenticator, 1Password ou outro aplicativo TOTP. Depois do cadastro, sua senha sozinha não libera acesso ao AdvOS.</p>

        {loading ? <p className="mt-6 text-sm font-bold text-slate-500">Verificando sua conta...</p> : !factorId ? (
          <button className="btn btn-primary mt-6 w-full" disabled={enrolling} onClick={startEnrollment}>{enrolling ? 'Preparando...' : 'Configurar autenticador'}</button>
        ) : (
          <div className="mt-6 space-y-5">
            {qrCode && <div className="mx-auto w-fit rounded-3xl border border-[#e7dccb] bg-white p-4"><img src={qrCode} alt="QR Code para configurar o autenticador" className="h-52 w-52" /></div>}
            <div className="rounded-2xl bg-[#fbf7ef] p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Se não conseguir ler o QR Code</p>
              <p className="mt-2 break-all font-mono text-sm font-bold text-slate-800">{secret}</p>
            </div>
            <div>
              <label className="label">Código de 6 dígitos</label>
              <input className="input mt-1 text-center text-xl tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
            <button className="btn btn-primary w-full" disabled={enrolling || code.length !== 6} onClick={verify}>{enrolling ? 'Validando...' : 'Ativar MFA e entrar'}</button>
          </div>
        )}

        {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        <div className="mt-6 flex items-center justify-between text-xs font-bold text-slate-500"><Link href="/" className="hover:text-slate-900">Início</Link><button type="button" onClick={signOut} className="hover:text-red-700">Sair da conta</button></div>
      </div>
    </main>
  );
}
