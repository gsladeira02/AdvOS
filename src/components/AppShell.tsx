import Link from 'next/link';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { CalendarDays, CheckSquare, Home, Plug, Scale, Settings, Users, UserCog, Wallet, ListChecks, UploadCloud, MessageCircle } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';

const items = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/servicos', 'Serviços', ListChecks],
  ['/app/processos', 'Processos', Scale],
  ['/app/prazos', 'Prazos', CalendarDays],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/whatsapp', 'WhatsApp', MessageCircle],
  ['/app/tarefas', 'Tarefas', CheckSquare],
  ['/app/usuarios', 'Usuários', UserCog],
  ['/app/integracoes', 'Integrações', Plug],
  ['/app/integracoes/asaas/importar', 'Importar Asaas', UploadCloud],
  ['/app/configuracoes', 'Configurações', Settings],
] as const;

const mobileItems = [
  ['/app/dashboard', 'Início', Home],
  ['/app/clientes', 'Clientes', Users],
  ['/app/financeiro', 'Financeiro', Wallet],
  ['/app/whatsapp', 'WhatsApp', MessageCircle],
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const { data: profileWithFirm } = await admin
    .from('profiles')
    .select('*, law_firms(name)')
    .eq('id', profile.id)
    .maybeSingle();

  if (profile.law_firm_id) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('status,current_period_end,grace_until')
      .eq('law_firm_id', profile.law_firm_id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    if (sub && sub.status !== 'ativa' && sub.grace_until && sub.grace_until < today) {
      redirect('/login?erro=assinatura');
    }
  }

  const navigationItems = isAdminRole(profile.role)
    ? items
    : items.filter(([href]) => !['/app/usuarios', '/app/integracoes', '/app/integracoes/asaas/importar'].includes(href));

  const firmName = profileWithFirm?.law_firms?.name || 'AdvOS interno';
  const userName = profile.full_name || session.user.email || 'Usuário';

  return (
    <div className="page-shell">
      <div className="desktop-grid grid min-h-[100dvh] md:grid-cols-[172px_1fr]">
        <aside className="sidebar sticky top-0 hidden h-screen flex-col border-r border-[#e6dccb] bg-white/95 px-2 py-3 shadow-sm backdrop-blur md:flex">
          <Link href="/app/dashboard" title={`AdvOS — ${firmName}`} className="mb-3 flex h-10 items-center gap-2 rounded-2xl bg-ink px-2 text-xs font-black text-white shadow-sm">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/15 text-sm">A</span>
            <span className="truncate">AdvOS</span>
          </Link>

          <nav className="flex w-full flex-1 flex-col gap-1 overflow-y-auto pb-3 pr-0.5">
            {navigationItems.map(([href, label, Icon]) => (
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

          <LogoutButton />
        </aside>

        <header className="mobile-pwa-top md:hidden">
          <Link href="/app/dashboard" className="flex items-center gap-2 font-black text-white">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15">A</span>
            <span className="leading-none">AdvOS</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 text-right">
              <p className="truncate text-[11px] font-black text-white">{firmName}</p>
              <p className="truncate text-[9px] font-bold text-white/65">{userName}</p>
            </div>
            <LogoutButton mobile />
          </div>
        </header>

        <main className="app-main min-w-0 p-3.5">{children}</main>

        <nav className="mobile-bottom-nav md:hidden" aria-label="Navegação principal do PWA">
          {mobileItems.map(([href, label, Icon]) => (
            <Link key={href} href={href} className="mobile-bottom-nav-item">
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
