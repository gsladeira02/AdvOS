'use client';

import { useEffect, useRef } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const IDLE_MS = 60 * 60 * 1000;
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const START_KEY = 'advos_session_started_at';
const ACTIVITY_KEY = 'advos_last_activity_at';

export function SessionSecurityGuard() {
  const signingOut = useRef(false);

  useEffect(() => {
    const now = Date.now();
    if (!Number(localStorage.getItem(START_KEY))) localStorage.setItem(START_KEY, String(now));
    localStorage.setItem(ACTIVITY_KEY, String(now));

    let lastWrite = 0;
    const touch = () => {
      const current = Date.now();
      if (current - lastWrite < 15_000) return;
      lastWrite = current;
      localStorage.setItem(ACTIVITY_KEY, String(current));
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));

    async function forceLogout(reason: 'inatividade' | 'tempo') {
      if (signingOut.current) return;
      signingOut.current = true;
      try {
        await fetch('/auth/signout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-AdvOS-Action': 'session-timeout' } });
      } catch {}
      try {
        await createBrowserSupabase().auth.signOut({ scope: 'local' });
      } catch {}
      localStorage.removeItem(START_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      window.location.replace(`/login?sessao=${reason}`);
    }

    const timer = window.setInterval(() => {
      const current = Date.now();
      const started = Number(localStorage.getItem(START_KEY) || current);
      const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY) || current);
      if (current - started >= MAX_SESSION_MS) void forceLogout('tempo');
      else if (current - lastActivity >= IDLE_MS) void forceLogout('inatividade');
    }, 30_000);

    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, touch));
    };
  }, []);

  return null;
}
