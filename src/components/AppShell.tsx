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
  const userName = profile?.full_name || session.user.email || 'Usuário';

  return (
    <div className="page-shell">
      <div className="mobile-readonly">
        AdvOS mobile: visualização rápida. Para cadastros completos, use o computador.
      </div>
      <div className="desktop-grid grid min-h-screen grid-cols-[138px_1fr]">
        <aside className="sidebar sticky top-0 flex h-screen flex-col border-r border-[#e6dccb] bg-white/95 px-2 py-3 shadow-sm backdrop-blur">
          <Link href="/app/dashboard" title={`AdvOS — ${firmName}`} className="mb-3 flex h-10 items-center gap-2 rounded-2xl bg-ink px-2 text-xs font-black text-white shadow-sm">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/15 text-sm">A</span>
            <span className="truncate">AdvOS</span>
          </Link>

          <nav className="flex w-full flex-1 flex-col gap-1 overflow-y-auto pb-3 pr-0.5">
            {items.map(([href, label, Icon]) => (
              <Link key={href} href={href} title={label} aria-label={label} className="group flex h-8 items-center gap-2 rounded-xl px-2 text-[11px] font-black text-slate-600 transition hover:bg-[#fbf7ef] hover:text-slate-950">
                <Icon size={14} className="shrink-0 text-slate-500 transition group-hover:text-slate-900" />
                <span className="truncate leading-none">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="mb-2 rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] px-2 py-2">
            <p className="truncate text-[10px] font-black text-slate-900">{userName}</p>
            <p className="truncate text-[9px] font-bold text-slate-500">{firmName}</p>
          </div>

          <form action="/auth/signout" method="post">
            <button title="Sair" aria-label="Sair" className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-[11px] font-black text-slate-600 transition hover:bg-red-50 hover:text-red-700">
              <LogOut size={14} className="shrink-0" />
              <span>Sair</span>
            </button>
          </form>
        </aside>
        <main className="app-main min-w-0 p-3.5">{children}</main>
      </div>
    </div>
  );
}
