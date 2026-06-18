import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarDays, CheckSquare, FileText, Home, LogOut, Plug, Scale, Settings, Users, Wallet } from 'lucide-react';

const items = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/processos', 'Processos', Scale],
  ['/app/prazos', 'Prazos', CalendarDays],
  ['/app/documentos', 'Documentos', FileText],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/tarefas', 'Tarefas', CheckSquare],
  ['/app/usuarios', 'Usuários', Briefcase],
  ['/app/integracoes', 'Integrações', Plug],
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
      <div className="desktop-grid grid min-h-screen grid-cols-[280px_1fr]">
        <aside className="sidebar border-r border-[#e8dfcf] bg-white p-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-xl font-black text-white">A</div>
            <div>
              <b className="text-xl">AdvOS</b>
              <p className="text-xs font-bold text-slate-500">{firmName}</p>
            </div>
          </div>

          <nav className="space-y-2">
            {items.map(([href, label, Icon]) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl px-4 py-3 font-bold text-slate-700 hover:bg-soft">
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>

          <form action="/auth/signout" method="post" className="mt-8">
            <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 font-bold text-slate-700 hover:bg-soft">
              <LogOut size={18} />
              Sair
            </button>
          </form>
        </aside>
        <main className="app-main p-8">{children}</main>
      </div>
    </div>
  );
}
