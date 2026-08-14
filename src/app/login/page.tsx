import Link from 'next/link';

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function errorMessage(code?: string) {
  switch (code) {
    case 'missing':
      return 'Informe e-mail e senha.';
    case 'invalid':
      return 'E-mail ou senha inválidos.';
    case 'origin':
      return 'Não foi possível validar a origem da solicitação. Recarregue a página e tente novamente.';
    case 'timeout':
      return 'A autenticação demorou mais que o esperado. Tente novamente.';
    case 'server':
      return 'Não foi possível concluir a autenticação. Tente novamente.';
    case 'session':
      return 'Sua sessão não pôde ser confirmada. Entre novamente.';
    case 'unauthorized':
      return 'Este usuário não possui acesso autorizado ao AdvOS.';
    case 'inactive':
      return 'Este usuário está desativado no AdvOS.';
    default:
      return '';
  }
}

export default async function Login({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const rawError = params?.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const error = errorMessage(errorCode);

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

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input
              id="email"
              name="email"
              className="input mt-1"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Senha</label>
            <input
              id="password"
              name="password"
              className="input mt-1"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary w-full">
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] font-bold leading-relaxed text-slate-500">
          Acesso restrito a usuários cadastrados e ativos no escritório.
        </p>
      </div>
    </main>
  );
}
