'use client';

import { useState, type FormEvent } from 'react';
import { LogOut } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function LogoutButton({ mobile = false }: { mobile?: boolean }) {
  const [leaving, setLeaving] = useState(false);

  async function logout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (leaving) return;
    setLeaving(true);

    try {
      // Primeiro pedimos ao servidor para invalidar e limpar os cookies SSR.
      await fetch('/auth/signout', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'X-AdvOS-Action': 'signout' },
        redirect: 'manual',
      });
    } catch {
      // Mesmo se a rede falhar, a sessão local ainda será removida abaixo.
    }

    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // O redirecionamento final garante que uma sessão inválida não permaneça na tela.
    }

    try {
      // Remove caches antigos de versões anteriores do PWA que possam ter guardado páginas.
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('advos-pwa-')).map((key) => window.caches.delete(key)));
      }
    } catch {}

    window.location.replace('/login?logout=1');
  }

  return (
    <form action="/auth/signout" method="post" onSubmit={logout} className={mobile ? 'shrink-0' : 'w-full'}>
      <button
        type="submit"
        disabled={leaving}
        title={leaving ? 'Saindo...' : 'Sair'}
        aria-label={leaving ? 'Saindo...' : 'Sair'}
        className={mobile
          ? 'grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60'
          : 'flex h-8 w-full items-center gap-2 rounded-xl px-2 text-[11px] font-black text-slate-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60'}
      >
        <LogOut size={mobile ? 15 : 14} className="shrink-0" />
        {!mobile && <span>{leaving ? 'Saindo...' : 'Sair'}</span>}
      </button>
    </form>
  );
}
