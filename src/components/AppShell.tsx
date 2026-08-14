import Link from 'next/link';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { LogoutButton } from '@/components/LogoutButton';
import { SessionSecurityGuard } from '@/components/SessionSecurityGuard';
import { DesktopNavigation, MobileMoreMenu, MobileNavigation } from '@/components/AppNavigation';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile } = await getCurrentProfile();
  const adminClient = createAdminSupabase();
  const { data: profileWithFirm } = await adminClient
    .from('profiles')
    .select('*, law_firms(name)')
    .eq('id', profile.id)
    .maybeSingle();

  const firmName = profileWithFirm?.law_firms?.name || 'AdvOS interno';
  const userName = profile.full_name || session.user.email || 'Usuário';
  const isAdmin = isAdminRole(profile.role);

  return (
    <div className="page-shell">
      <SessionSecurityGuard />
      <div className="desktop-grid grid min-h-[100dvh] md:grid-cols-[204px_minmax(0,1fr)]">
        <aside className="sidebar sticky top-0 hidden h-screen min-w-0 flex-col border-r border-[#e8e2d8] bg-white/95 px-3 py-3.5 shadow-[10px_0_30px_rgba(15,23,42,.025)] backdrop-blur md:flex">
          <Link href="/app/dashboard" title={`AdvOS — ${firmName}`} className="brand-block mb-3 flex h-11 items-center gap-2.5 rounded-[14px] bg-ink px-2.5 text-white shadow-sm">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-white/14 text-[13px] font-black">A</span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black leading-tight">AdvOS</p>
              <p className="truncate text-[9px] font-semibold leading-tight text-white/55">Gestão jurídica</p>
            </div>
          </Link>

          <DesktopNavigation admin={isAdmin} />

          <div className="mt-3 rounded-[14px] border border-[#ece5db] bg-[#faf8f4] px-2.5 py-2.5">
            <p className="truncate text-[10px] font-black text-slate-900">{userName}</p>
            <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500">{firmName}</p>
          </div>
          <div className="mt-2"><LogoutButton /></div>
        </aside>

        <header className="mobile-pwa-top md:hidden">
          <Link href="/app/dashboard" className="flex min-w-0 items-center gap-2.5 font-black text-white">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white/14">A</span>
            <div className="min-w-0">
              <p className="truncate text-[13px] leading-tight">AdvOS</p>
              <p className="truncate text-[9px] font-semibold leading-tight text-white/55">{firmName}</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5"><MobileMoreMenu admin={isAdmin} /><LogoutButton mobile /></div>
        </header>

        <main className="app-main min-w-0">
          <div className="app-content">{children}</div>
        </main>

        <MobileNavigation />
      </div>
    </div>
  );
}
