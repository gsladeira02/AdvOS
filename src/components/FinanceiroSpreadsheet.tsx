'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Filter, Search } from 'lucide-react';
import { FinanceWhatsappCharge, type ChargeTemplateOption } from '@/components/FinanceWhatsappCharge';
import { dateBR, money } from '@/lib/utils';
import { TablePagination } from '@/components/TablePagination';
import { FinanceInstallmentActions } from '@/components/FinanceInstallmentActions';
import { paymentMethodLabel } from '@/lib/finance';

type ClientOption = {
  id: string;
  name: string;
};

type FinanceiroSpreadsheetProps = {
  installments: any[];
  clients: ClientOption[];
  firmName?: string | null;
  firmPhone?: string | null;
  userName?: string | null;
  templates: ChargeTemplateOption[];
};

type SortKey = 'due_date' | 'amount';
type SortDir = 'asc' | 'desc';

function normalize(value: any) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toTime(date?: string | null) {
  if (!date) return 0;
  const time = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function chargeUrl(installment: any) {
  return installment.invoice_url || installment.payment_url || installment.bank_slip_url || '';
}

function installmentLabel(installment: any) {
  const raw = installment.financial_contracts?.description || installment.raw_payload?.descricao || installment.raw_payload?.description || '';
  const text = String(raw).trim();

  const explicitInstallment =
    String(installment.raw_payload?.parcela || installment.raw_payload?.Parcela || installment.raw_payload?.installment || '').trim();

  if (explicitInstallment) return explicitInstallment;

  const match = text.match(/(?:parcela|parc\.?|prestação)\s*(?:n[ºo°.]*)?\s*([0-9]+(?:\s*\/\s*[0-9]+)?)/i);
  if (match?.[1]) return `Parcela ${match[1].replace(/\s+/g, '')}`;

  return text || 'Cobrança de honorários';
}

function SortButton(props: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left font-black uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-slate-950"
      onClick={props.onClick}
      title={`Ordenar por ${props.label.toLowerCase()}`}
    >
      <span>{props.label}</span>
      <span className="text-[12px] leading-none text-slate-900">{props.active ? (props.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

export function FinanceiroSpreadsheet({ installments, clients, firmName, firmPhone, userName, templates }: FinanceiroSpreadsheetProps) {
  const [rows, setRows] = useState<any[]>(installments || []);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [statusError, setStatusError] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['atrasado']);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setRows(installments || []);
  }, [installments]);

  async function changeStatus(installmentId: string, nextStatus: string) {
    if (!installmentId || statusUpdating) return;
    const previous = rows.find((item: any) => String(item.id) === String(installmentId));
    if (!previous || previous.status === nextStatus) return;

    setStatusUpdating(installmentId);
    setStatusError('');
    setRows((current) => current.map((item: any) => String(item.id) === String(installmentId) ? { ...item, status: nextStatus } : item));

    try {
      const response = await fetch('/api/finance/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId, status: nextStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível alterar o status.');
      setRows((current) => current.map((item: any) => String(item.id) === String(installmentId) ? { ...item, ...(result.installment || {}) } : item));
    } catch (error: any) {
      setRows((current) => current.map((item: any) => String(item.id) === String(installmentId) ? previous : item));
      setStatusError(error?.message || 'Não foi possível alterar o status da cobrança.');
    } finally {
      setStatusUpdating(null);
    }
  }

  const filteredInstallments = useMemo(() => {
    return [...rows]
      .filter((i: any) => {
        const client = i.financial_contracts?.clients;
        const label = installmentLabel(i);
        const haystack = normalize(`${client?.name || ''} ${label} ${i.status || ''} ${paymentMethodLabel(i.payment_method, i.billing_type)}`);
        const due = String(i.due_date || '');

        if (clientFilter && client?.id !== clientFilter) return false;
        if (statusFilters.length && !statusFilters.includes(String(i.status || 'pendente'))) return false;
        if (dateFrom && due < dateFrom) return false;
        if (dateTo && due > dateTo) return false;
        if (searchText && !haystack.includes(normalize(searchText))) return false;

        return true;
      })
      .sort((a: any, b: any) => {
        let result = 0;
        if (sortKey === 'amount') result = Number(a.amount || 0) - Number(b.amount || 0);
        if (sortKey === 'due_date') result = toTime(a.due_date) - toTime(b.due_date);
        return sortDir === 'asc' ? result : -result;
      });
  }, [rows, clientFilter, statusFilters, dateFrom, dateTo, searchText, sortKey, sortDir]);

  const filteredTotal = useMemo(() => {
    return filteredInstallments.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  }, [filteredInstallments]);

  const paginatedInstallments = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredInstallments.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredInstallments.slice(start, start + pageSize);
  }, [filteredInstallments, page, pageSize]);

  useEffect(() => { setPage(1); }, [clientFilter, statusFilters, dateFrom, dateTo, searchText, sortKey, sortDir]);

  function toggleStatusFilter(status: string) {
    setStatusFilters((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === 'due_date' ? 'asc' : 'desc');
  }

  function clearFilters() {
    setClientFilter('');
    setStatusFilters(['atrasado']);
    setDateFrom('');
    setDateTo('');
    setSearchText('');
    setSortKey('due_date');
    setSortDir('asc');
  }

  const statusButtons = (
    <div className="status-filter-row" aria-label="Filtrar por status">
      {[
        ['atrasado', 'Em atraso'],
        ['pendente', 'Aguardando'],
        ['pago', 'Recebido'],
      ].map(([value, label]) => {
        const active = statusFilters.includes(value);
        return (
          <button key={value} type="button" onClick={() => toggleStatusFilter(value)} className={`status-filter-chip ${active ? 'is-active' : ''}`} aria-pressed={active}>
            {active ? '✓ ' : ''}{label}
          </button>
        );
      })}
      {!statusFilters.length && <span className="px-1 text-[10px] font-bold text-slate-400">Todos</span>}
    </div>
  );

  const advancedFilters = (
    <>
      <select className="input compact-input" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
        <option value="">Todos os clientes</option>
        {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
      </select>
      <input className="input compact-input" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" title="Data inicial" />
      <input className="input compact-input" value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" title="Data final" />
      <button type="button" className="btn btn-ghost !min-h-0 !rounded-lg !px-3 !py-2 text-[11px]" onClick={clearFilters}>Limpar filtros</button>
    </>
  );

  return (
    <section className="card mb-5 overflow-hidden">
      <div className="border-b border-[#eee8df] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><h2 className="text-[14px] font-black text-slate-950">Cobranças</h2><p className="hidden text-[10px] font-medium text-slate-500 md:block">Status, vencimento, valor e cobrança em uma linha.</p></div>
          <div className="shrink-0 text-right"><p className="text-[10px] font-black text-slate-500">{filteredInstallments.length} cobrança(s)</p><p className="text-[11px] font-black text-slate-900">{money(filteredTotal)}</p></div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="field-with-icon min-w-0 flex-1">
            <Search className="field-with-icon__icon text-slate-400" size={14} />
            <input className="input compact-input field-with-icon__input" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar cliente ou cobrança" />
          </div>
          <details className="mobile-filter-disclosure md:hidden">
            <summary title="Filtros" aria-label="Filtros"><Filter size={16} /><span>Filtros</span><ChevronDown size={13} className="disclosure-chevron" /></summary>
            <div className="mobile-filter-panel">{advancedFilters}</div>
          </details>
        </div>
        <div className="mt-2">{statusButtons}</div>
        <div className="mt-2 hidden grid-cols-4 gap-2 md:grid">{advancedFilters}</div>
      </div>

      {statusError && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] font-bold text-red-700">{statusError}</div>}

      <div className="hidden overflow-x-auto md:block">
        <table className="professional-table min-w-[820px] w-full">
          <thead><tr><th>Cliente</th><th><SortButton label="Vencimento" active={sortKey === 'due_date'} dir={sortDir} onClick={() => toggleSort('due_date')} /></th><th><SortButton label="Valor" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')} /></th><th>Parcela</th><th>Status</th><th>Pagamento / excluir</th><th>Cobrar</th></tr></thead>
          <tbody>{paginatedInstallments.map((item: any) => {
            const client = item.financial_contracts?.clients;
            const label = installmentLabel(item);
            const url = chargeUrl(item);
            const phone = client?.whatsapp || client?.phone;
            return <tr key={item.id}>
              <td>{client?.id ? <Link href={`/app/clientes/${client.id}`} className="table-primary-link" title={client?.name || ''}>{client?.name || '-'}</Link> : <span className="table-primary-link">{client?.name || '-'}</span>}</td>
              <td>{dateBR(item.due_date)}</td><td className="font-black">{money(item.amount)}</td><td><span className="table-ellipsis max-w-[280px]" title={label}>{label}</span></td>
              <td className="w-[180px]"><select value={item.status || 'pendente'} disabled={statusUpdating === item.id} onChange={(event) => void changeStatus(String(item.id), event.target.value)} className={`finance-status-select ${item.status === 'pago' ? 'is-paid' : item.status === 'atrasado' ? 'is-overdue' : 'is-waiting'}`}><option value="pendente">Aguardando pagamento</option><option value="atrasado">Em atraso</option><option value="pago">Pagamento recebido</option></select></td>
              <td className="w-[210px]"><FinanceInstallmentActions installmentId={String(item.id)} paymentMethod={item.payment_method} billingType={item.billing_type} compact onUpdated={(paymentMethod) => setRows((current) => current.map((row:any) => String(row.id) === String(item.id) ? {...row,payment_method:paymentMethod} : row))} onDeleted={() => setRows((current) => current.filter((row:any) => String(row.id) !== String(item.id)))} /></td>
              <td className="w-[68px] text-center"><FinanceWhatsappCharge paid={item.status === 'pago'} clientId={client?.id} clientName={client?.name} phone={phone} installmentLabel={label} amount={Number(item.amount || 0)} dueDate={item.due_date} asaasUrl={url} firmName={firmName} firmPhone={firmPhone} userName={userName} templates={templates} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="mobile-record-list md:hidden">
        {paginatedInstallments.map((item: any) => {
          const client = item.financial_contracts?.clients;
          const label = installmentLabel(item);
          const url = chargeUrl(item);
          const phone = client?.whatsapp || client?.phone;
          return <details className="mobile-record" key={item.id}>
            <summary>
              <div className="mobile-record-main"><strong>{client?.name || 'Cliente não vinculado'}</strong><span>Vence {dateBR(item.due_date)} · {label}</span></div>
              <div className="mobile-record-side"><strong>{money(item.amount)}</strong><span className={`mobile-status-dot ${item.status === 'pago' ? 'is-paid' : item.status === 'atrasado' ? 'is-overdue' : 'is-waiting'}`}>{item.status === 'pago' ? 'Recebido' : item.status === 'atrasado' ? 'Em atraso' : 'Aguardando'}</span><ChevronDown size={15} className="disclosure-chevron" /></div>
            </summary>
            <div className="mobile-record-details">
              <div className="mobile-detail-grid"><div><span>Vencimento</span><b>{dateBR(item.due_date)}</b></div><div><span>Valor</span><b>{money(item.amount)}</b></div><div><span>Pagamento</span><b>{paymentMethodLabel(item.payment_method, item.billing_type)}</b></div><div><span>Descrição</span><b>{label}</b></div></div>
              <label className="mt-3 block"><span className="label mb-1">Status</span><select value={item.status || 'pendente'} disabled={statusUpdating === item.id} onChange={(event) => void changeStatus(String(item.id), event.target.value)} className={`finance-status-select ${item.status === 'pago' ? 'is-paid' : item.status === 'atrasado' ? 'is-overdue' : 'is-waiting'}`}><option value="pendente">Aguardando pagamento</option><option value="atrasado">Em atraso</option><option value="pago">Pagamento recebido</option></select></label>
              <div className="mt-3"><span className="label mb-1">Forma de pagamento / excluir</span><FinanceInstallmentActions installmentId={String(item.id)} paymentMethod={item.payment_method} billingType={item.billing_type} onUpdated={(paymentMethod) => setRows((current) => current.map((row:any) => String(row.id) === String(item.id) ? {...row,payment_method:paymentMethod} : row))} onDeleted={() => setRows((current) => current.filter((row:any) => String(row.id) !== String(item.id)))} /></div>
              <div className="mobile-record-actions"><FinanceWhatsappCharge paid={item.status === 'pago'} clientId={client?.id} clientName={client?.name} phone={phone} installmentLabel={label} amount={Number(item.amount || 0)} dueDate={item.due_date} asaasUrl={url} firmName={firmName} firmPhone={firmPhone} userName={userName} templates={templates} />{client?.id && <Link href={`/app/clientes/${client.id}`} className="btn btn-secondary">Abrir cliente</Link>}</div>
            </div>
          </details>;
        })}
      </div>

      {!!filteredInstallments.length && <TablePagination page={page} pageSize={pageSize} totalItems={filteredInstallments.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      {!filteredInstallments.length && <div className="p-5 text-[12px] font-bold text-slate-500">Nenhuma cobrança encontrada.</div>}
    </section>
  );
}
