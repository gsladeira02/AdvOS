import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarDays, CheckSquare, Home, LogOut, Plug, Scale, Settings, Users, Wallet, ListChecks, UploadCloud, MessageSquare, MessageCircle } from 'lucide-react';

const items = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/servicos', 'Serviços', ListChecks],
  ['/app/processos', 'Processos', Scale],
  ['/app/prazos', 'Prazos', CalendarDays],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/whatsapp', 'WhatsApp', MessageCircle],
  ['/app/tarefas', 'Tarefas', CheckSquare],
  ['/app/usuarios', 'Usuários', Briefcase],
  ['/app/integracoes', 'Integrações', Plug],
  ['/app/integracoes/asaas/importar', 'Importar Asaas', UploadCloud],
  ['/app/modelos-mensagens', 'Modelos', MessageSquare],
  ['/app/configuracoes', 'Configurações', Settings],
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, law_firms(name)')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (profile?.status && profile.status !== 'ativo') redirect('/login?erro=inativo');

  if (profile?.law_firm_id) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status,current_period_end,grace_until')
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    if (sub && sub.status !== 'ativa' && sub.grace_until && sub.grace_until < today) {
      redirect('/login?erro=assinatura');
    }
  }

  const firmName = profile?.law_firms?.name || 'AdvOS interno';

  return (
    <div className="page-shell">
      <div className="mobile-readonly">
        AdvOS mobile: visualização rápida de painéis. Cadastros completos são melhores no computador.
      </div>
      <div className="desktop-grid grid min-h-screen grid-cols-[58px_1fr]">
        <aside className="sidebar sticky top-0 flex h-screen flex-col items-center border-r border-[#e8dfcf] bg-white px-1.5 py-3">
          <Link
            href="/app/dashboard"
            title={`AdvOS — ${firmName}`}
            className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-ink text-lg font-black text-white shadow-sm"
          >
            A
            <span className="sr-only">AdvOS</span>
          </Link>

          <nav className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto pb-3">
            {items.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 transition hover:bg-soft hover:text-slate-950"
              >
                <Icon size={17} />
                <span className="sr-only">{label}</span>
              </Link>
            ))}
          </nav>

          <form action="/auth/signout" method="post" className="mt-2">
            <button
              title="Sair"
              aria-label="Sair"
              className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 transition hover:bg-soft hover:text-slate-950"
            >
              <LogOut size={17} />
              <span className="sr-only">Sair</span>
            </button>
          </form>
        </aside>
        <main className="app-main min-w-0 p-4">{children}</main>
      </div>
    </div>
  );
}
