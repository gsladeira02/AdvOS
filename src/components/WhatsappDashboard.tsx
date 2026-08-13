'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Inbox, MessageCircle, RefreshCw, TrendingUp, Users, XCircle } from 'lucide-react';

const toneMap: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  sky: 'bg-sky-100 text-sky-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
  red: 'bg-red-100 text-red-700',
  green: 'bg-green-100 text-green-700',
  indigo: 'bg-indigo-100 text-indigo-700',
};

function tone(value?: string) {
  return toneMap[String(value || '')] || toneMap.slate;
}

function Metric({ icon: Icon, label, value, note }: { icon: any; label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl border border-[#e6dccb] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          {note && <p className="mt-1 text-[10px] font-semibold text-slate-500">{note}</p>}
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f3efe7] text-[#075e54]"><Icon size={17} /></div>
      </div>
    </div>
  );
}

export function WhatsappDashboard({ initialDashboard, leadPlural = 'Leads' }: { initialDashboard: any; leadPlural?: string }) {
  const [dashboard, setDashboard] = useState(initialDashboard || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/dashboard?_=${Date.now()}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível atualizar o dashboard.');
      setDashboard(result.dashboard);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar o dashboard.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(true);
    const id = window.setInterval(() => { void refresh(true); }, 15000);
    return () => window.clearInterval(id);
  }, []);

  const maxStage = useMemo(() => Math.max(1, ...(dashboard?.leads?.byStage || []).map((stage: any) => Number(stage.count || 0))), [dashboard]);

  if (!dashboard) return <div className="panel p-6 text-sm font-bold text-slate-500">Carregando dashboard do WhatsApp...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Dashboard do WhatsApp</h2>
          <p className="text-xs font-semibold text-slate-500">Visão geral do atendimento, funil e conversas.</p>
        </div>
        <button type="button" onClick={() => refresh(false)} disabled={loading} className="btn btn-secondary !px-3 !py-2 text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label={`${leadPlural} em aberto`} value={dashboard.leads.open} note={`${dashboard.leads.newToday} novo(s) hoje`} />
        <Metric icon={CheckCircle2} label="Convertidos" value={dashboard.leads.converted} note={`${dashboard.leads.converted30d} nos últimos 30 dias`} />
        <Metric icon={TrendingUp} label="Taxa de conversão" value={`${dashboard.leads.conversionRate}%`} note="Entre convertidos e perdidos" />
        <Metric icon={Inbox} label="Não lidas" value={dashboard.conversations.unreadMessages} note={`${dashboard.conversations.unreadConversations} conversa(s)`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3">
            <div className="flex items-center gap-2"><BarChart3 size={16} className="text-[#075e54]" /><h3 className="text-sm font-black text-slate-950">Funil de {leadPlural.toLowerCase()}</h3></div>
          </div>
          <div className="space-y-3 p-4">
            {(dashboard.leads.byStage || []).map((stage: any) => (
              <div key={stage.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                  <span className={`rounded-full px-2 py-1 font-black ${tone(stage.color)}`}>{stage.name}</span>
                  <b className="text-slate-800">{stage.count}</b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#075e54]" style={{ width: `${Math.max(stage.count ? 6 : 0, Math.round((Number(stage.count || 0) / maxStage) * 100))}%` }} />
                </div>
              </div>
            ))}
            {!(dashboard.leads.byStage || []).length && <p className="text-xs font-bold text-slate-500">Nenhuma etapa configurada.</p>}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3">
            <div className="flex items-center gap-2"><MessageCircle size={16} className="text-[#075e54]" /><h3 className="text-sm font-black text-slate-950">Conversas por área</h3></div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Atendimento</p><p className="mt-1 text-xl font-black text-emerald-950">{dashboard.conversations.atendimento}</p></div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><p className="text-[10px] font-black uppercase text-indigo-700">Financeiro/Jurídico</p><p className="mt-1 text-xl font-black text-indigo-950">{dashboard.conversations.financeiroJuridico}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-600">Total de conversas</p><p className="mt-1 text-xl font-black text-slate-950">{dashboard.conversations.total}</p></div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Novos últimos 30 dias</p><p className="mt-1 text-xl font-black text-amber-950">{dashboard.leads.new30d}</p></div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="flex items-center gap-2"><Clock3 size={15} className="text-[#075e54]" /><h3 className="text-sm font-black text-slate-950">Resumo do funil</h3></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-sky-50 p-3"><p className="text-[9px] font-black uppercase text-sky-700">Total</p><b className="text-lg text-sky-950">{dashboard.leads.total}</b></div>
            <div className="rounded-xl bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">Em aberto</p><b className="text-lg text-emerald-950">{dashboard.leads.open}</b></div>
            <div className="rounded-xl bg-green-50 p-3"><p className="text-[9px] font-black uppercase text-green-700">Convertidos</p><b className="text-lg text-green-950">{dashboard.leads.converted}</b></div>
            <div className="rounded-xl bg-red-50 p-3"><p className="text-[9px] font-black uppercase text-red-700">Perdidos</p><b className="text-lg text-red-950">{dashboard.leads.lost}</b></div>
          </div>
        </section>

        <section className="panel p-4">
          <div className="flex items-center gap-2"><XCircle size={15} className="text-[#075e54]" /><h3 className="text-sm font-black text-slate-950">Tags mais usadas</h3></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(dashboard.tags || []).map((tag: any) => <span key={tag.id} className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${tone(tag.color)}`}>{tag.name} · {tag.count}</span>)}
            {!(dashboard.tags || []).length && <p className="text-xs font-bold text-slate-500">As tags usadas nas conversas aparecerão aqui.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
