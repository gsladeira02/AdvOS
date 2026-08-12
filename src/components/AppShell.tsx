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
  ['/app/integracoes/asaas/importar', 'Importar', UploadCloud],
  ['/app/modelos-mensagens', 'Modelos', MessageSquare],
  ['/app/configuracoes', 'Config.', Settings],
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
      <div className="desktop-grid grid min-h-screen grid-cols-[126px_1fr]">
        <aside className="sidebar sticky top-0 flex h-screen flex-col border-r border-[#e8dfcf] bg-white px-2 py-3">
          <Link
            href="/app/dashboard"
            title={`AdvOS — ${firmName}`}
            className="mb-3 flex h-9 items-center gap-2 rounded-xl bg-ink px-2 text-xs font-black text-white shadow-sm"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/15 text-sm">A</span>
            <span className="truncate">AdvOS</span>
          </Link>

          <nav className="flex w-full flex-1 flex-col gap-1 overflow-y-auto pb-3">
            {items.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className="flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] font-black text-slate-600 transition hover:bg-soft hover:text-slate-950"
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate leading-none">{label}</span>
              </Link>
            ))}
          </nav>

          <form action="/auth/signout" method="post" className="mt-2">
            <button
              title="Sair"
              aria-label="Sair"
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[11px] font-black text-slate-600 transition hover:bg-soft hover:text-slate-950"
            >
              <LogOut size={14} className="shrink-0" />
              <span>Sair</span>
            </button>
          </form>
        </aside>
        <main className="app-main min-w-0 p-4">{children}</main>
      </div>
    </div>
  );
}
