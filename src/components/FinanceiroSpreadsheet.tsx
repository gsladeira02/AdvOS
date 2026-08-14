'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FinanceWhatsappCharge, type ChargeTemplateOption } from '@/components/FinanceWhatsappCharge';
import { dateBR, money } from '@/lib/utils';

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
  const [statusFilter, setStatusFilter] = useState('atrasado');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
        const haystack = normalize(`${client?.name || ''} ${label} ${i.status || ''}`);
        const due = String(i.due_date || '');

        if (clientFilter && client?.id !== clientFilter) return false;
        if (statusFilter === 'em_aberto' && i.status === 'pago') return false;
        if (statusFilter !== 'todos' && statusFilter !== 'em_aberto' && i.status !== statusFilter) return false;
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
  }, [rows, clientFilter, statusFilter, dateFrom, dateTo, searchText, sortKey, sortDir]);

  const filteredTotal = useMemo(() => {
    return filteredInstallments.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  }, [filteredInstallments]);

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
    setStatusFilter('atrasado');
    setDateFrom('');
    setDateTo('');
    setSearchText('');
    setSortKey('due_date');
    setSortDir('asc');
  }

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="border-b border-[#eee4d4] p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Tabela financeira</h2>
            <p className="text-xs text-slate-500">Filtre por cliente, status e período. Clique nas setas de vencimento ou valor para ordenar.</p>
          </div>
          <div className="text-xs font-bold text-slate-600">
            {filteredInstallments.length} {filteredInstallments.length === 1 ? 'cobrança' : 'cobranças'} • {money(filteredTotal)}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <select className="input !rounded-lg !px-3 !py-2 text-xs md:col-span-2" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value="">Todos os clientes</option>
            {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
          </select>

          <select className="input !rounded-lg !px-3 !py-2 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} title="Filtrar por status">
            <option value="atrasado">Em atraso</option>
            <option value="em_aberto">Em aberto</option>
            <option value="pendente">Aguardando pagamento</option>
            <option value="pago">Pagamento recebido</option>
            <option value="todos">Todas</option>
          </select>

          <input className="input !rounded-lg !px-3 !py-2 text-xs" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" title="Data inicial" />
          <input className="input !rounded-lg !px-3 !py-2 text-xs" value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" title="Data final" />
          <input
            className="input !rounded-lg !px-3 !py-2 text-xs md:col-span-2"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar cliente ou parcela"
          />
          <button type="button" className="btn btn-ghost !rounded-lg !px-3 !py-2 text-xs" onClick={clearFilters}>Limpar</button>
        </div>
      </div>

      {statusError && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] font-bold text-red-700">{statusError}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full border-collapse bg-white text-xs">
          <thead className="bg-[#fbf7ef] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">Cliente</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left">
                <SortButton label="Vencimento" active={sortKey === 'due_date'} dir={sortDir} onClick={() => toggleSort('due_date')} />
              </th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left">
                <SortButton label="Valor" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')} />
              </th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">Parcela</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">Status</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-center font-black">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {filteredInstallments.map((item: any) => {
              const client = item.financial_contracts?.clients;
              const label = installmentLabel(item);
              const url = chargeUrl(item);
              const phone = client?.whatsapp || client?.phone;

              return (
                <tr key={item.id} className="border-b border-[#f0e7d8] align-top hover:bg-[#fffaf2]">
                  <td className="px-3 py-2">
                    {client?.id ? (
                      <Link
                        href={`/app/clientes/${client.id}`}
                        className="block max-w-[230px] truncate text-xs font-black text-slate-950 hover:text-blue-700 hover:underline"
                        title={client?.name || ''}
                      >
                        {client?.name || '-'}
                      </Link>
                    ) : (
                      <div className="max-w-[230px] truncate text-xs font-black text-slate-950" title={client?.name || ''}>{client?.name || '-'}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-900">{dateBR(item.due_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-900">{money(item.amount)}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[300px] truncate font-semibold text-slate-800" title={label}>{label}</div>
                  </td>
                  <td className="min-w-[190px] px-3 py-2">
                    <select
                      value={item.status || 'pendente'}
                      disabled={statusUpdating === item.id}
                      onChange={(event) => void changeStatus(String(item.id), event.target.value)}
                      className={`w-full rounded-lg border px-2 py-1.5 text-[10px] font-black outline-none transition disabled:cursor-wait disabled:opacity-60 ${
                        item.status === 'pago'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : item.status === 'atrasado'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                      aria-label={`Alterar status de ${client?.name || 'cobrança'}`}
                    >
                      <option value="pendente">Aguardando pagamento</option>
                      <option value="atrasado">Em atraso</option>
                      <option value="pago">Pagamento recebido</option>
                    </select>
                  </td>
                  <td className="w-[88px] px-3 py-2 text-center">
                    <FinanceWhatsappCharge
                      paid={item.status === 'pago'}
                      clientId={client?.id}
                      clientName={client?.name}
                      phone={phone}
                      installmentLabel={label}
                      amount={Number(item.amount || 0)}
                      dueDate={item.due_date}
                      asaasUrl={url}
                      firmName={firmName}
                      firmPhone={firmPhone}
                      userName={userName}
                      templates={templates}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!filteredInstallments.length && (
        <div className="p-6 text-sm font-bold text-slate-500">Nenhuma cobrança encontrada.</div>
      )}
    </section>
  );
}
