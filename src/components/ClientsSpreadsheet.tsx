'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { TablePagination } from '@/components/TablePagination';

export type ClientSpreadsheetRow = {
  id: string;
  name?: string | null;
  doc?: string | null;
  client_type?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  created_at?: string | null;
  legal_services?: { id?: string | null; name?: string | null } | null;
};

export type ClientServiceOption = {
  id: string;
  name: string;
  active?: boolean;
};

type SortKey = 'name' | 'created_at' | 'service' | 'type';
type SortDir = 'asc' | 'desc';

function normalize(value: any) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

function hasWhatsApp(client: ClientSpreadsheetRow) {
  return Boolean(String(client.whatsapp || client.phone || '').replace(/\D/g, ''));
}

function SortButton(props: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
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

export function ClientsSpreadsheet({ clients, services }: { clients: ClientSpreadsheetRow[]; services: ClientServiceOption[] }) {
  const [searchText, setSearchText] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [contactFilter, setContactFilter] = useState('todos');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filteredClients = useMemo(() => {
    return [...(clients || [])]
      .filter((client) => {
        const serviceName = client.legal_services?.name || '';
        const haystack = normalize(`${client.name || ''} ${client.doc || ''} ${client.email || ''} ${client.phone || ''} ${client.whatsapp || ''} ${serviceName} ${client.client_type || ''}`);
        const term = normalize(searchText);
        const serviceId = String(client.legal_services?.id || '');
        const clientType = normalize(client.client_type || '');
        const whatsapp = hasWhatsApp(client);
        const email = Boolean(String(client.email || '').trim());

        if (term && !haystack.includes(term)) return false;
        if (serviceFilter && serviceId !== serviceFilter) return false;
        if (typeFilter !== 'todos' && clientType !== normalize(typeFilter)) return false;
        if (contactFilter === 'com_whatsapp' && !whatsapp) return false;
        if (contactFilter === 'sem_whatsapp' && whatsapp) return false;
        if (contactFilter === 'com_email' && !email) return false;
        if (contactFilter === 'sem_email' && email) return false;

        return true;
      })
      .sort((a, b) => {
        let result = 0;
        if (sortKey === 'name') result = normalize(a.name).localeCompare(normalize(b.name));
        if (sortKey === 'service') result = normalize(a.legal_services?.name).localeCompare(normalize(b.legal_services?.name));
        if (sortKey === 'type') result = normalize(a.client_type).localeCompare(normalize(b.client_type));
        if (sortKey === 'created_at') result = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        return sortDir === 'asc' ? result : -result;
      });
  }, [clients, searchText, serviceFilter, typeFilter, contactFilter, sortKey, sortDir]);

  const paginatedClients = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredClients.slice(start, start + pageSize);
  }, [filteredClients, page, pageSize]);

  function resetPage() { setPage(1); }

  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (sortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === 'created_at' ? 'desc' : 'asc');
  }

  function clearFilters() {
    setSearchText('');
    setServiceFilter('');
    setTypeFilter('todos');
    setContactFilter('todos');
    setSortKey('name');
    setSortDir('asc');
    setPage(1);
  }

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="border-b border-[#eee4d4] p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-950">Tabela de clientes</h2>
            <p className="text-xs text-slate-500">Busque, filtre e ordene os clientes como uma planilha.</p>
          </div>
          <div className="text-xs font-bold text-slate-600">
            {filteredClients.length} de {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <input
            className="input !rounded-lg !px-3 !py-2 text-xs md:col-span-2"
            value={searchText}
            onChange={(event) => { setSearchText(event.target.value); resetPage(); }}
            placeholder="Buscar nome, CPF, telefone, e-mail"
          />

          <select className="input !rounded-lg !px-3 !py-2 text-xs md:col-span-2" value={serviceFilter} onChange={(event) => { setServiceFilter(event.target.value); resetPage(); }}>
            <option value="">Todos os serviços</option>
            {services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
          </select>

          <select className="input !rounded-lg !px-3 !py-2 text-xs" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); resetPage(); }}>
            <option value="todos">Todos os tipos</option>
            <option value="pessoa física">Pessoa física</option>
            <option value="pessoa jurídica">Pessoa jurídica</option>
          </select>

          <select className="input !rounded-lg !px-3 !py-2 text-xs" value={contactFilter} onChange={(event) => { setContactFilter(event.target.value); resetPage(); }}>
            <option value="todos">Todos os contatos</option>
            <option value="com_whatsapp">Com WhatsApp</option>
            <option value="sem_whatsapp">Sem WhatsApp</option>
            <option value="com_email">Com e-mail</option>
            <option value="sem_email">Sem e-mail</option>
          </select>

          <button type="button" className="btn btn-ghost !rounded-lg !px-3 !py-2 text-xs md:col-span-2" onClick={clearFilters}>Limpar filtros</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[960px] w-full border-collapse bg-white text-xs">
          <thead className="bg-[#fbf7ef] text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left"><SortButton label="Nome" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} /></th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">Documento</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left"><SortButton label="Tipo" active={sortKey === 'type'} dir={sortDir} onClick={() => toggleSort('type')} /></th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left"><SortButton label="Serviço" active={sortKey === 'service'} dir={sortDir} onClick={() => toggleSort('service')} /></th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">WhatsApp</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left font-black">E-mail</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-left"><SortButton label="Criado" active={sortKey === 'created_at'} dir={sortDir} onClick={() => toggleSort('created_at')} /></th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-center font-black">WhatsApp API</th>
              <th className="border-b border-[#eee4d4] px-3 py-2 text-center font-black">Pasta</th>
            </tr>
          </thead>
          <tbody>
            {paginatedClients.map((client) => (
              <tr key={client.id} className="border-b border-[#f0e7d8] align-top hover:bg-[#fffaf2]">
                <td className="px-3 py-2">
                  <Link href={`/app/clientes/${client.id}`} className="block max-w-[260px] truncate text-xs font-black text-slate-950 hover:text-blue-700 hover:underline" title={client.name || ''}>
                    {client.name || '-'}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{client.doc || '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{client.client_type || '-'}</td>
                <td className="px-3 py-2"><div className="max-w-[240px] truncate font-semibold text-slate-700" title={client.legal_services?.name || ''}>{client.legal_services?.name || '-'}</div></td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{client.whatsapp || client.phone || '-'}</td>
                <td className="px-3 py-2"><div className="max-w-[260px] truncate text-slate-700" title={client.email || ''}>{client.email || '-'}</div></td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(client.created_at)}</td>
                <td className="w-[92px] px-3 py-2 text-center">
                  {hasWhatsApp(client) ? (
                    <Link
                      href={`/app/whatsapp?cliente=${client.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:scale-105 hover:bg-[#1ebe5d]"
                      title="Abrir conversa pela API"
                      aria-label="Abrir conversa pela API"
                    >
                      <MessageCircle size={15} />
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-400" title="Cliente sem telefone">—</span>
                  )}
                </td>
                <td className="w-[92px] px-3 py-2 text-center">
                  <Link href={`/app/clientes/${client.id}`} className="btn btn-secondary !rounded-lg !px-3 !py-1.5 text-[11px]">Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!!filteredClients.length && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filteredClients.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}

      {!filteredClients.length && <div className="p-6 text-sm font-bold text-slate-500">Nenhum cliente encontrado.</div>}
    </section>
  );
}
