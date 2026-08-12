'use client';

import { useMemo, useState } from 'react';
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

function statusBadge(status: string) {
  if (status === 'pago') return 'badge-ok';
  if (status === 'atrasado') return 'badge-danger';
  return 'badge-warn';
}

function statusLabel(status: string) {
  if (status === 'pago') return 'Pago';
  if (status === 'atrasado') return 'Atrasado';
  return 'Pendente';
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
      className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-left font-black uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-slate-950"
      onClick={props.onClick}
      title={`Ordenar por ${props.label.toLowerCase()}`}
    >
      <span>{props.label}</span>
      <span className="text-sm leading-none text-slate-900">{props.active ? (props.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

export function FinanceiroSpreadsheet({ installments, clients, firmName, firmPhone, userName, templates }: FinanceiroSpreadsheetProps) {
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('atrasado');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filteredInstallments = useMemo(() => {
    return [...installments]
      .filter((i: any) => {
        const client = i.financial_contracts?.clients;
        const label = installmentLabel(i);
        const haystack = normalize(`${client?.name || ''} ${label} ${i.status || ''} ${i.external_id || ''}`);
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
  }, [installments, clientFilter, statusFilter, dateFrom, dateTo, searchText, sortKey, sortDir]);

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
      <div className="border-b border-[#eee4d4] p-5">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Tabela financeira</h2>
            <p className="text-sm text-slate-500">Os filtros alteram a tabela automaticamente. Use as setas em vencimento e valor para ordenar.</p>
          </div>
          <div className="text-sm font-bold text-slate-600">
            {filteredInstallments.length} cobrança(s) • {money(filteredTotal)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <select className="input md:col-span-2" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value="">Todos os clientes</option>
            {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
          </select>

          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="atrasado">Atrasadas</option>
            <option value="em_aberto">Em aberto</option>
            <option value="pendente">Pendentes</option>
            <option value="pago">Pagas</option>
            <option value="todos">Todas</option>
          </select>

          <input className="input" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" title="Data inicial" />
          <input className="input" value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" title="Data final" />
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Limpar</button>

          <input
            className="input md:col-span-6"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar por cliente, parcela ou ID Asaas"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse bg-white text-sm">
          <thead className="bg-[#fbf7ef] text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left font-black">Cliente</th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left">
                <SortButton label="Vencimento" active={sortKey === 'due_date'} dir={sortDir} onClick={() => toggleSort('due_date')} />
              </th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left">
                <SortButton label="Valor" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')} />
              </th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left font-black">Parcela</th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left font-black">Status</th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left font-black">Asaas</th>
              <th className="border-b border-[#eee4d4] px-4 py-3 text-left font-black">WhatsApp</th>
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
                  <td className="px-4 py-3">
                    <div className="max-w-[240px] truncate text-sm font-black text-slate-950" title={client?.name || ''}>{client?.name || '-'}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{phone || 'Sem telefone'}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-900">{dateBR(item.due_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-900">{money(item.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate font-bold text-slate-800" title={label}>{label}</div>
                    {item.external_id && <div className="mt-1 text-[11px] text-slate-400">ID Asaas: {item.external_id}</div>}
                  </td>
                  <td className="px-4 py-3"><span className={`badge ${statusBadge(item.status)}`}>{statusLabel(item.status)}</span></td>
                  <td className="px-4 py-3">
                    {url ? (
                      <Link href={url} target="_blank" className="text-xs font-black text-blue-700 hover:underline">Abrir cobrança</Link>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">Sem link</span>
                    )}
                  </td>
                  <td className="w-[260px] px-4 py-3">
                    <FinanceWhatsappCharge
                      paid={item.status === 'pago'}
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
