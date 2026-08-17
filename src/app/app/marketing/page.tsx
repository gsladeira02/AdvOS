export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { BarChart3, CircleDollarSign, Megaphone, Target, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadMarketingDashboard } from '@/lib/marketingDashboard';
import { money } from '@/lib/utils';

function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pct(value: number) { return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`; }
function ratio(value: number) { return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}x`; }
function platformLabel(value?: string) { return value === 'meta' ? 'Meta Ads' : value === 'google' ? 'Google Ads' : 'Orgânico / outros'; }
function dateBR(value?: string | null) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}
function brazilToday() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}
function monthDates() {
  const now = brazilToday();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

export default async function MarketingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const periodParam = firstParam(query?.period) || '30';
  const allowed = new Set(['7','30','90','365','all']);
  const period = allowed.has(periodParam) ? periodParam : '30';
  const days = period === 'all' ? null : Number(period);
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const canManageSpend = isAdminRole(profile.role);
  const month = monthDates();

  let dashboard: any = null;
  let loadError = '';
  try {
    dashboard = await loadMarketingDashboard(admin, profile.law_firm_id, days);
  } catch (error: any) {
    console.error('Marketing dashboard:', error);
    const message = String(error?.message || '');
    loadError = /does not exist|schema cache|PGRST205|column/i.test(message)
      ? 'Execute supabase/v9_58_comercial_marketing.sql no Supabase para ativar o painel Comercial + Marketing.'
      : 'Não foi possível carregar os indicadores de marketing agora.';
  }

  const summary = dashboard?.summary || { leads:0, qualified:0, proposals:0, contracted:0, paidClients:0, lost:0, contractRevenue:0, receivedRevenue:0, spend:0, cpl:0, cpa:0, roi:0, roas:0, conversionRate:0 };
  const maxFunnel = Math.max(1, ...(dashboard?.funnel || []).map((row: any) => Number(row.count || 0)));
  const periodHref = (value: string) => `/app/marketing?period=${value}`;

  return (
    <div>
      <PageHeader
        title="Marketing & Comercial"
        subtitle="Do clique ao pagamento: origem do lead, funil, contratos, receita e retorno por campanha/anúncio."
        action={<Link href="/app/whatsapp?tab=leads" className="btn btn-secondary"><Target size={15}/>Abrir leads</Link>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[['7','7 dias'],['30','30 dias'],['90','90 dias'],['365','12 meses'],['all','Todo período']].map(([value,label]) => (
          <Link key={value} href={periodHref(value)} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${period === value ? 'bg-[#075e54] text-white' : 'border border-[#e8dfcf] bg-white text-slate-600 hover:bg-[#fbf7ef]'}`}>{label}</Link>
        ))}
      </div>

      {loadError && <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{loadError}</div>}

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <StatCard label="Leads" value={summary.leads} detail={`${summary.qualified} qualificado(s) • ${summary.proposals} proposta(s)`} />
        <StatCard label="Contratados" value={summary.contracted} detail={`${pct(summary.conversionRate)} de conversão lead → contrato`} />
        <StatCard label="Receita contratada" value={money(summary.contractRevenue)} detail={`${money(summary.receivedRevenue)} já recebido`} />
        <StatCard label="Investimento em mídia" value={money(summary.spend)} detail={summary.spend > 0 ? `CPL ${money(summary.cpl)} • CPA ${money(summary.cpa)}` : 'Informe os custos para calcular ROI'} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="card p-3"><p className="text-[9px] font-black uppercase text-slate-500">ROI</p><p className={`mt-1 text-xl font-black ${summary.spend > 0 && summary.roi >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{summary.spend > 0 ? pct(summary.roi) : '—'}</p></div>
        <div className="card p-3"><p className="text-[9px] font-black uppercase text-slate-500">ROAS</p><p className="mt-1 text-xl font-black text-slate-900">{summary.spend > 0 ? ratio(summary.roas) : '—'}</p></div>
        <div className="card p-3"><p className="text-[9px] font-black uppercase text-slate-500">Custo por lead</p><p className="mt-1 text-xl font-black text-slate-900">{summary.spend > 0 ? money(summary.cpl) : '—'}</p></div>
        <div className="card p-3"><p className="text-[9px] font-black uppercase text-slate-500">Custo por contrato</p><p className="mt-1 text-xl font-black text-slate-900">{summary.spend > 0 && summary.contracted ? money(summary.cpa) : '—'}</p></div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
        <section className="card p-4">
          <div className="flex items-center gap-2"><TrendingUp size={16} className="text-[#075e54]"/><div><h2 className="text-[15px] font-black">Funil comercial</h2><p className="text-[10px] font-semibold text-slate-500">Acompanhe a passagem do lead até o primeiro pagamento.</p></div></div>
          <div className="mt-4 space-y-2.5">
            {(dashboard?.funnel || []).map((row: any, index: number) => {
              const width = Math.max(7, Math.round((Number(row.count || 0) / maxFunnel) * 100));
              const previous = index ? Number(dashboard.funnel[index - 1]?.count || 0) : 0;
              const stepRate = previous > 0 ? Math.round((Number(row.count || 0) / previous) * 1000) / 10 : null;
              return <div key={row.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><b className="text-slate-700">{row.label}</b><span className="font-black text-slate-950">{row.count}{stepRate !== null ? <span className="ml-1 font-bold text-slate-400">· {pct(stepRate)}</span> : null}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#075e54]" style={{ width: `${width}%` }}/></div>
              </div>;
            })}
            {!dashboard?.funnel?.length && <p className="text-sm text-slate-500">Sem dados no período.</p>}
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-center gap-2"><Megaphone size={16} className="text-[#075e54]"/><div><h2 className="text-[15px] font-black">Origem dos resultados</h2><p className="text-[10px] font-semibold text-slate-500">Compare Meta, Google e entradas orgânicas.</p></div></div>
          <div className="mt-3 space-y-2">
            {(dashboard?.platform || []).map((row: any) => <div key={row.key} className="rounded-xl border border-[#eee4d4] p-3">
              <div className="flex items-center justify-between gap-2"><b className="text-xs text-slate-900">{row.label}</b><span className="text-[10px] font-black text-[#075e54]">{row.leads} lead(s)</span></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-bold text-slate-500"><span>Contratos<br/><b className="text-slate-900">{row.contracted}</b></span><span>Receita<br/><b className="text-slate-900">{money(row.contractRevenue)}</b></span><span>Conversão<br/><b className="text-slate-900">{pct(row.conversionRate)}</b></span></div>
              {row.spend > 0 && <div className="mt-2 border-t border-slate-100 pt-2 text-[9px] font-bold text-slate-500">Investido {money(row.spend)} · ROAS <b className="text-slate-800">{ratio(row.roas)}</b> · ROI <b className={row.roi >= 0 ? 'text-emerald-700' : 'text-red-600'}>{pct(row.roi)}</b></div>}
            </div>)}
            {!dashboard?.platform?.length && <p className="text-sm text-slate-500">Sem leads no período.</p>}
          </div>
        </section>
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee4d4] p-4"><div><h2 className="text-[15px] font-black">Campanhas</h2><p className="text-[10px] font-semibold text-slate-500">Ranking por receita contratada e conversão.</p></div><BarChart3 size={18} className="text-[#075e54]"/></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-[10px]">
            <thead className="bg-[#fbf8f2] text-[9px] uppercase text-slate-500"><tr><th className="p-3">Canal / campanha</th><th className="p-3">Leads</th><th className="p-3">Qualif.</th><th className="p-3">Contratos</th><th className="p-3">Conversão</th><th className="p-3">Receita</th><th className="p-3">Recebido</th><th className="p-3">Custo</th><th className="p-3">ROAS</th></tr></thead>
            <tbody>{(dashboard?.campaigns || []).map((row: any) => <tr key={row.key} className="border-t border-[#f0ebe2]"><td className="p-3"><b className="block max-w-[280px] truncate text-slate-900" title={row.label}>{row.label}</b><span className="font-semibold text-slate-400">{platformLabel(row.platform)}</span></td><td className="p-3 font-black">{row.leads}</td><td className="p-3">{row.qualified}</td><td className="p-3 font-black">{row.contracted}</td><td className="p-3">{pct(row.conversionRate)}</td><td className="p-3 font-black">{money(row.contractRevenue)}</td><td className="p-3">{money(row.receivedRevenue)}</td><td className="p-3">{row.spend ? money(row.spend) : '—'}</td><td className="p-3 font-black">{row.spend ? ratio(row.roas) : '—'}</td></tr>)}
            {!dashboard?.campaigns?.length && <tr><td colSpan={9} className="p-5 text-center text-sm text-slate-500">Nenhuma campanha identificada no período.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-[#eee4d4] p-4"><h2 className="text-[15px] font-black">Anúncios / criativos</h2><p className="text-[10px] font-semibold text-slate-500">Quais anúncios geram contratos, não apenas mensagens.</p></div>
          <div className="max-h-[520px] overflow-auto">
            {(dashboard?.ads || []).slice(0, 20).map((row: any) => <div key={row.key} className="border-b border-[#f1ece4] p-3 last:border-b-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-[11px] text-slate-900" title={row.label}>{row.label}</b><p className="truncate text-[9px] font-semibold text-slate-400">{platformLabel(row.platform)} · {row.campaign}</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">{money(row.contractRevenue)}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-bold text-slate-500"><span>{row.leads} leads</span><span>{row.contracted} contratos</span><span>{pct(row.conversionRate)} conversão</span>{row.spend > 0 && <span>{ratio(row.roas)} ROAS</span>}</div></div>)}
            {!dashboard?.ads?.length && <p className="p-4 text-sm text-slate-500">Nenhum anúncio identificado.</p>}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[15px] font-black">Por que os leads são perdidos?</h2><p className="text-[10px] font-semibold text-slate-500">O motivo passa a ser obrigatório ao mover um lead para uma etapa de perda.</p>
          <div className="mt-3 space-y-2">
            {(dashboard?.lossReasons || []).map((row: any) => <div key={row.key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-[10px] font-bold text-slate-700">{row.label}</span><b className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-900 shadow-sm">{row.count}</b></div>)}
            {!dashboard?.lossReasons?.length && <p className="text-sm text-slate-500">Nenhuma perda registrada no período.</p>}
          </div>
          {!!dashboard?.stagesTime?.length && <div className="mt-5 border-t border-[#eee4d4] pt-4"><h3 className="text-xs font-black">Tempo médio por etapa</h3><div className="mt-2 grid grid-cols-2 gap-2">{dashboard.stagesTime.slice(0, 8).map((row: any) => <div key={row.key} className="rounded-xl border border-[#eee4d4] p-2.5"><p className="truncate text-[9px] font-bold text-slate-500">{row.name}</p><p className="mt-0.5 text-sm font-black text-slate-900">{row.averageHours < 48 ? `${row.averageHours.toLocaleString('pt-BR')} h` : `${(row.averageHours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`}</p></div>)}</div></div>}
        </section>
      </div>

      <section className="card mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-[15px] font-black"><CircleDollarSign size={16} className="text-[#075e54]"/>Custos de mídia</h2><p className="text-[10px] font-semibold text-slate-500">Necessário para CPL, CPA, ROI e ROAS. Pode ser lançado por plataforma, campanha ou anúncio.</p></div>{!canManageSpend && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-500">Somente administradores alteram custos</span>}</div>
        {canManageSpend && <form action="/api/marketing/spend" method="post" className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="redirect_to" value={`/app/marketing?period=${period}`} />
          <label><span className="label">Plataforma</span><select className="input mt-1" name="source_platform" required><option value="meta">Meta Ads</option><option value="google">Google Ads</option></select></label>
          <label><span className="label">Início</span><input className="input mt-1" type="date" name="period_start" defaultValue={month.start} required /></label>
          <label><span className="label">Fim</span><input className="input mt-1" type="date" name="period_end" defaultValue={month.end} required /></label>
          <label><span className="label">Valor investido</span><input className="input mt-1" name="amount" inputMode="decimal" placeholder="0,00" required /></label>
          <label><span className="label">ID da campanha</span><input className="input mt-1" name="campaign_id" placeholder="Opcional" /></label>
          <label><span className="label">Nome da campanha</span><input className="input mt-1" name="campaign_name" placeholder="Opcional" /></label>
          <label><span className="label">ID do anúncio</span><input className="input mt-1" name="ad_id" placeholder="Opcional" /></label>
          <label><span className="label">Nome do anúncio</span><input className="input mt-1" name="ad_name" placeholder="Opcional" /></label>
          <label className="md:col-span-2 xl:col-span-3"><span className="label">Observação</span><input className="input mt-1" name="notes" placeholder="Ex.: investimento total de agosto" /></label>
          <button className="btn btn-primary self-end"><CircleDollarSign size={14}/>Registrar custo</button>
        </form>}
        {!!dashboard?.spendEntries?.length && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[10px]"><thead className="bg-[#fbf8f2] text-[9px] uppercase text-slate-500"><tr><th className="p-2.5">Período</th><th className="p-2.5">Plataforma</th><th className="p-2.5">Campanha/anúncio</th><th className="p-2.5">Valor</th>{canManageSpend && <th className="p-2.5 text-right">Ação</th>}</tr></thead><tbody>{dashboard.spendEntries.slice(0, 30).map((row: any) => <tr key={row.id} className="border-t border-[#eee4d4]"><td className="p-2.5">{dateBR(row.period_start)}–{dateBR(row.period_end)}</td><td className="p-2.5 font-black">{platformLabel(row.source_platform)}</td><td className="p-2.5"><b>{row.campaign_name || row.campaign_id || 'Toda a plataforma'}</b>{(row.ad_name || row.ad_id) && <span className="block text-[9px] text-slate-500">{row.ad_name || row.ad_id}</span>}</td><td className="p-2.5 font-black">{money(row.amount)}</td>{canManageSpend && <td className="p-2.5 text-right"><form action="/api/marketing/spend" method="post"><input type="hidden" name="intent" value="delete"/><input type="hidden" name="entry_id" value={row.id}/><input type="hidden" name="redirect_to" value={`/app/marketing?period=${period}`}/><button className="text-[9px] font-black text-red-600 hover:underline">Excluir</button></form></td>}</tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
