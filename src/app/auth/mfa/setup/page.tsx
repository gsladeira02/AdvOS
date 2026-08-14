'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const AUTH_TIMEOUT_MS = 12000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms = AUTH_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('AUTH_TIMEOUT')),
          ms
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isAuthTimeout(error: unknown) {
  return (
    error instanceof Error &&
    error.message === 'AUTH_TIMEOUT'
  );
}

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

    async function checkAccount() {
      try {
        const {
          data: { user },
          error: userError,
        } = await withTimeout(
          supabase.auth.getUser()
        );

        if (!active) return;

        if (userError || !user) {
          window.location.replace('/login');
          return;
        }

        const {
          data,
          error: aalError,
        } = await withTimeout(
          supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        );

        if (!active) return;

        if (aalError) {
          throw aalError;
        }

        if (data?.currentLevel === 'aal2') {
          window.location.replace('/app/dashboard');
          return;
        }

        /*
         * Se nextLevel já for AAL2, significa que existe
         * um fator MFA verificado cadastrado para a conta.
         * Nesse caso, o usuário deve apenas informar o
         * código de 6 dígitos.
         */
        if (data?.nextLevel === 'aal2') {
          window.location.replace('/auth/mfa');
          return;
        }

        setLoading(false);
      } catch (err: unknown) {
        if (!active) return;

        setLoading(false);

        setError(
          isAuthTimeout(err)
            ? 'A verificação demorou mais que o esperado. Tente novamente.'
            : 'Não foi possível verificar sua conta. Tente novamente.'
        );
      }
    }

    void checkAccount();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function removeUnverifiedTotpFactors() {
    try {
      const listed = await withTimeout(
        supabase.auth.mfa.listFactors()
      );

      if (listed.error) {
        return;
      }

      const totpFactors = Array.isArray(listed.data?.totp)
        ? listed.data.totp
        : [];

      const allFactors = Array.isArray(listed.data?.all)
        ? listed.data.all
        : [];

      const candidates = [...totpFactors, ...allFactors];

      const processedIds = new Set<string>();

      for (const factor of candidates) {
        const id = String(factor.id || '');

        /*
         * IMPORTANTE:
         *
         * O objeto Factor retornado pelo Supabase utiliza
         * "factor_type".
         *
         * "factorType" é usado apenas como parâmetro
         * ao criar um novo fator com mfa.enroll().
         */
        const type = String(
          factor.factor_type || 'totp'
        );

        const status = String(
          factor.status || ''
        );

        if (
          id &&
          type === 'totp' &&
          status === 'unverified' &&
          !processedIds.has(id)
        ) {
          processedIds.add(id);

          try {
            await withTimeout(
              supabase.auth.mfa.unenroll({
                factorId: id,
              })
            );
          } catch {
            /*
             * Um fator antigo que não puder ser removido
             * não deve impedir a tentativa de criar
             * um novo MFA.
             */
          }
        }
      }
    } catch {
      /*
       * A limpeza é apenas preventiva.
       * Se falhar, seguimos para o enrollment.
       */
    }
  }

  async function startEnrollment() {
    if (enrolling) return;

    setError('');
    setEnrolling(true);

    try {
      /*
       * Tentativas anteriores interrompidas podem
       * deixar fatores TOTP não verificados.
       */
      await removeUnverifiedTotpFactors();

      const {
        data,
        error: enrollError,
      } = await withTimeout(
        supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'AdvOS',
        })
      );

      if (
        enrollError ||
        !data?.id ||
        !data?.totp
      ) {
        setError(
          'Não foi possível iniciar a autenticação em dois fatores.'
        );
        return;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code || '');
      setSecret(data.totp.secret || '');
      setCode('');
    } catch (err: unknown) {
      setError(
        isAuthTimeout(err)
          ? 'A configuração demorou mais que o esperado. Tente novamente.'
          : 'Não foi possível iniciar a autenticação em dois fatores.'
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function verify() {
    if (enrolling) return;

    const cleanCode = code
      .replace(/\D/g, '')
      .slice(0, 6);

    if (!factorId) {
      setError(
        'O autenticador ainda não foi configurado. Gere um novo QR Code.'
      );
      return;
    }

    if (cleanCode.length !== 6) {
      setError(
        'Digite o código de 6 dígitos do aplicativo autenticador.'
      );
      return;
    }

    setError('');
    setEnrolling(true);

    try {
      const {
        error: verifyError,
      } = await withTimeout(
        supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: cleanCode,
        })
      );

      if (verifyError) {
        setError(
          'Código inválido ou expirado. Confira o autenticador e tente novamente.'
        );
        return;
      }

      /*
       * Confirma que a sessão realmente subiu para AAL2
       * antes de liberar o sistema.
       */
      const {
        data: assurance,
        error: assuranceError,
      } = await withTimeout(
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      );

      if (
        assuranceError ||
        assurance?.currentLevel !== 'aal2'
      ) {
        setError(
          'O código foi aceito, mas não foi possível confirmar a autenticação em dois fatores. Tente novamente.'
        );
        return;
      }

      window.location.replace('/app/dashboard');
    } catch (err: unknown) {
      setError(
        isAuthTimeout(err)
          ? 'A validação demorou mais que o esperado. Tente novamente.'
          : 'Não foi possível validar o código. Tente novamente.'
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function signOut() {
    setError('');

    try {
      await withTimeout(
        supabase.auth.signOut({
          scope: 'local',
        })
      );
    } catch {
      // O redirecionamento ocorre mesmo se a limpeza local falhar.
    } finally {
      window.location.replace('/login');
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <div className="card w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-white">
            <ShieldCheck size={24} />
          </div>

          <div className="min-w-0">
            <b className="block text-xl leading-relaxed">
              Segurança do AdvOS
            </b>

            <p className="text-sm font-bold leading-relaxed text-slate-500">
              Autenticação em dois fatores obrigatória
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-black leading-relaxed">
          Proteja sua conta
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Use Google Authenticator, Microsoft Authenticator,
          1Password ou outro aplicativo TOTP. Depois do cadastro,
          sua senha sozinha não libera acesso ao AdvOS.
        </p>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-[#fbf7ef] p-4">
            <p className="text-sm font-bold leading-relaxed text-slate-500">
              Verificando sua conta...
            </p>
          </div>
        ) : !factorId ? (
          <button
            type="button"
            className="btn btn-primary mt-6 w-full"
            disabled={enrolling}
            onClick={startEnrollment}
          >
            {enrolling
              ? 'Preparando...'
              : 'Configurar autenticador'}
          </button>
        ) : (
          <div className="mt-6 space-y-5">
            {qrCode ? (
              <div className="mx-auto w-fit rounded-3xl border border-[#e7dccb] bg-white p-4">
                <img
                  src={qrCode}
                  alt="QR Code para configurar o autenticador"
                  className="h-52 w-52"
                />
              </div>
            ) : null}

            {secret ? (
              <div className="rounded-2xl bg-[#fbf7ef] p-4">
                <p className="text-xs font-black uppercase leading-relaxed tracking-wide text-slate-500">
                  Se não conseguir ler o QR Code
                </p>

                <p className="mt-2 break-all font-mono text-sm font-bold leading-relaxed text-slate-800">
                  {secret}
                </p>
              </div>
            ) : null}

            <div>
              <label
                htmlFor="mfa-code"
                className="label"
              >
                Código de 6 dígitos
              </label>

              <input
                id="mfa-code"
                className="input mt-1 text-center text-xl tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => {
                  setCode(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6)
                  );

                  if (error) {
                    setError('');
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    code.length === 6 &&
                    !enrolling
                  ) {
                    void verify();
                  }
                }}
                autoFocus
              />
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={
                enrolling ||
                code.length !== 6
              }
              onClick={verify}
            >
              {enrolling
                ? 'Validando...'
                : 'Ativar MFA e entrar'}
            </button>

            <button
              type="button"
              className="btn w-full"
              disabled={enrolling}
              onClick={() => {
                setFactorId('');
                setQrCode('');
                setSecret('');
                setCode('');
                setError('');
              }}
            >
              Gerar outro QR Code
            </button>
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-4 text-xs font-bold leading-relaxed text-slate-500">
          <Link
            href="/"
            className="hover:text-slate-900"
          >
            Início
          </Link>

          <button
            type="button"
            onClick={signOut}
            className="hover:text-red-700"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </main>
  );
}