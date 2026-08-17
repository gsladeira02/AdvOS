'use client';

import { BarChart3, BriefcaseBusiness, CircleDollarSign, TrendingUp } from 'lucide-react';
import { money } from '@/lib/utils';

type LeadStage = { key: string; name: string; count: number; color?: string };
type ServicePoint = { id: string; name: string; count: number };
type FinanceMonth = { key: string; label: string; received: number };

function pct(value: number, max: number) {
  if (!value || !max) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}

export function OfficeDashboardCharts({
  leadsByStage,
  services,
  financeMonths,
  waitingValue,
  overdueValue,
}: {
  leadsByStage: LeadStage[];
  services: ServicePoint[];
  financeMonths: FinanceMonth[];
  waitingValue: number;
  overdueValue: number;
}) {
  const maxLead = Math.max(1, ...leadsByStage.map((item) => Number(item.count || 0)));
  const maxService = Math.max(1, ...services.map((item) => Number(item.count || 0)));
  const maxFinance = Math.max(1, ...financeMonths.map((item) => Number(item.received || 0)));
  const receivableTotal = Number(waitingValue || 0) + Number(overdueValue || 0);
  const overduePct = receivableTotal > 0 ? Math.round((Number(overdueValue || 0) / receivableTotal) * 100) : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#eee4d4] bg-[#fbf7ef] px-5 py-4">
          <TrendingUp size={17} className="text-[#075e54]" />
          <div>
            <h2 className="text-sm font-black text-slate-950">Funil de leads</h2>
            <p className="text-[10px] font-semibold text-slate-500">Distribuição atual por etapa do atendimento.</p>
          </div>
        </div>
        <div className="space-y-3 p-5">
          {leadsByStage.map((stage) => (
            <div key={stage.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-black text-slate-700">{stage.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-700">{stage.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#075e54]" style={{ width: `${pct(stage.count, maxLead)}%` }} />
              </div>
            </div>
          ))}
          {!leadsByStage.length && <p className="text-xs font-bold text-slate-500">Ainda não há leads no funil.</p>}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#eee4d4] bg-[#fbf7ef] px-5 py-4">
          <BriefcaseBusiness size={17} className="text-[#075e54]" />
          <div>
            <h2 className="text-sm font-black text-slate-950">Serviços mais contratados</h2>
            <p className="text-[10px] font-semibold text-slate-500">Quantidade de clientes vinculados a cada serviço.</p>
          </div>
        </div>
        <div className="space-y-3 p-5">
          {services.map((service) => (
            <div key={service.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-black text-slate-700" title={service.name}>{service.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-700">{service.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-800" style={{ width: `${pct(service.count, maxService)}%` }} />
              </div>
            </div>
          ))}
          {!services.length && <p className="text-xs font-bold text-slate-500">Vincule serviços aos clientes para preencher este gráfico.</p>}
        </div>
      </section>

      <section className="panel overflow-hidden xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee4d4] bg-[#fbf7ef] px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-[#075e54]" />
            <div>
              <h2 className="text-sm font-black text-slate-950">Recebimentos dos últimos 6 meses</h2>
              <p className="text-[10px] font-semibold text-slate-500">Valores com status de pagamento recebido, agrupados pelo mês do recebimento.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-600">
            <CircleDollarSign size={14} className="text-[#075e54]" />
            Carteira atual: {money(receivableTotal)}
          </div>
        </div>
        <div className="p-5">
          <div className="grid h-[210px] grid-cols-6 items-end gap-2 sm:gap-4">
            {financeMonths.map((month) => {
              const height = month.received > 0 ? Math.max(8, Math.round((month.received / maxFinance) * 150)) : 3;
              return (
                <div key={month.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                  <div className="text-center text-[9px] font-black text-slate-600 sm:text-[10px]">{month.received > 0 ? money(month.received) : '—'}</div>
                  <div className="flex h-[150px] w-full items-end justify-center rounded-xl bg-slate-50 px-1.5 pb-0">
                    <div className="w-full max-w-[58px] rounded-t-lg bg-[#075e54] transition-all" style={{ height }} title={`${month.label}: ${money(month.received)}`} />
                  </div>
                  <div className="truncate text-[9px] font-black uppercase text-slate-500 sm:text-[10px]">{month.label}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Aguardando pagamento</p>
              <p className="mt-1 text-xl font-black text-amber-950">{money(waitingValue)}</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-700">Em atraso</p>
                  <p className="mt-1 text-xl font-black text-red-950">{money(overdueValue)}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-red-700">{overduePct}% da carteira</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
