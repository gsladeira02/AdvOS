'use client';

import { useMemo, useState } from 'react';
import { FinanceInstallmentActions } from '@/components/FinanceInstallmentActions';
import { dateBR, money } from '@/lib/utils';

type Installment = {
  id: string;
  contract_id?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  paid_at?: string | null;
  status?: string | null;
  provider?: string | null;
  payment_method?: string | null;
  billing_type?: string | null;
  invoice_url?: string | null;
  payment_url?: string | null;
  contract?: { description?: string | null } | null;
};

type Situation = 'pago' | 'vencido' | 'a_vencer' | 'cancelado' | 'sem_vencimento';
type Filter = Situation | 'todas';

const label: Record<Situation, string> = {
  pago: 'Paga',
  vencido: 'Vencida',
  a_vencer: 'A vencer',
  cancelado: 'Cancelada',
  sem_vencimento: 'Sem vencimento',
};
const badge: Record<Situation, string> = {
  pago: 'badge-ok',
  vencido: 'badge-danger',
  a_vencer: 'badge-warn',
  cancelado: 'badge-warn',
  sem_vencimento: 'badge-warn',
};

function situation(item: Installment, today: string): Situation {
  const status = String(item.status || '').toLowerCase().trim();
  if (status === 'cancelado' || status === 'cancelada' || status === 'canceled') return 'cancelado';
  if (status === 'pago' || status === 'recebido' || status === 'confirmado' || Boolean(item.paid_at)) return 'pago';
  if (!item.due_date) return 'sem_vencimento';
  return item.due_date < today ? 'vencido' : 'a_vencer';
}

function securePaymentLink(item: Installment) {
  const url = String(item.invoice_url || item.payment_url || '').trim();
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

export function ClientInstallmentsOverview({ rows, today }: { rows: Installment[]; today: string }) {
  const [filter, setFilter] = useState<Filter>('todas');

  const installments = useMemo(() => rows.map(item => ({
    ...item,
    situation: situation(item, today),
    amountValue: Number(item.amount || 0),
  })).sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'))), [rows, today]);

  const summary = useMemo(() => {
    const counts: Record<Filter, number> = { todas: 0, pago: 0, vencido: 0, a_vencer: 0, cancelado: 0, sem_vencimento: 0 };
    const amounts: Record<Filter, number> = { todas: 0, pago: 0, vencido: 0, a_vencer: 0, cancelado: 0, sem_vencimento: 0 };
    for (const item of installments) {
      counts.todas++;
      counts[item.situation]++;
      amounts.todas += item.amountValue;
      amounts[item.situation] += item.amountValue;
    }
    return { counts, amounts };
  }, [installments]);

  const grouped = useMemo(() => {
    const total = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const item of installments) if (item.contract_id) total.set(item.contract_id, (total.get(item.contract_id) || 0) + 1);
    return installments.map(item => {
      const id = String(item.contract_id || '');
      if (!id) return { ...item, installmentNumber: '', installmentTotal: 0 };
      const index = (seen.get(id) || 0) + 1;
      seen.set(id, index);
      return { ...item, installmentNumber: String(index), installmentTotal: total.get(id) || 0 };
    });
  }, [installments]);

  const filters: Filter[] = ['todas','vencido','a_vencer','pago','cancelado','sem_vencimento'];
  const filtered = filter === 'todas' ? grouped : grouped.filter(item => item.situation === filter);

  return <div className="mt-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {(['todas','vencido','a_vencer','pago'] as Filter[]).map(key =>
        <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
          className={'rounded-xl border p-3 text-left transition-colors ' + (filter === key ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
          <span className="block text-xs text-slate-600">{key === 'todas' ? 'Todas as parcelas' : label[key as Situation]}</span>
          <strong className="mt-1 block text-xl">{summary.counts[key]}</strong>
          <span className="mt-1 block text-xs text-slate-500">{money(summary.amounts[key])}</span>
        </button>
      )}
    </div>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar parcelas por situação">
      {filters.map(key =>
        <button type="button" key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
          className={'btn text-xs ' + (filter === key ? 'btn-primary' : 'btn-secondary')}>
          {key === 'todas' ? 'Todas' : label[key as Situation]} ({summary.counts[key]})
        </button>
      )}
    </div>
    <div className="table-responsive mt-4">
      <table className="table min-w-[940px]">
        <thead><tr><th>Cobrança / parcela</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Pagamento / ações</th></tr></thead>
        <tbody>
          {filtered.map(item => <tr key={item.id}>
            <td>
              <b>{item.contract?.description || 'Cobrança'}</b>
              {item.installmentTotal > 1 && <span className="ml-2 text-xs text-slate-500">Parcela {item.installmentNumber}/{item.installmentTotal}</span>}
              {item.provider === 'asaas' && <span className="ml-2 badge badge-warn">Asaas</span>}
              {securePaymentLink(item) && <a className="mt-1 block text-xs font-semibold text-emerald-700 underline" href={securePaymentLink(item)} target="_blank" rel="noopener noreferrer">Abrir cobrança</a>}
            </td>
            <td>{item.due_date ? dateBR(item.due_date) : '—'}</td>
            <td className="font-black">{money(item.amountValue)}</td>
            <td>
              <span className={'badge ' + badge[item.situation]}>{label[item.situation]}</span>
              {item.situation === 'pago' && item.paid_at && <span className="mt-1 block text-xs text-slate-500">Pago em {dateBR(item.paid_at)}</span>}
              {item.situation === 'a_vencer' && item.due_date === today && <span className="mt-1 block text-xs text-slate-500">Vence hoje</span>}
            </td>
            <td><FinanceInstallmentActions installmentId={String(item.id)} paymentMethod={item.payment_method} billingType={item.billing_type} compact /></td>
          </tr>)}
        </tbody>
      </table>
      {!filtered.length && <p className="mt-3 text-sm text-slate-500">Nenhuma parcela nesta situação.</p>}
    </div>
    <p className="mt-3 text-xs text-slate-500">
      A situação é calculada usando o vencimento atual. Parcelas pagas permanecem pagas e parcelas canceladas não são contadas como atrasadas.
    </p>
  </div>;
}
