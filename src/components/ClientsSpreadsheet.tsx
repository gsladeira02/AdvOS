'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Filter, MessageCircle, Search, UserRound } from 'lucide-react';
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

export type ClientServiceOption = { id: string; name: string; active?: boolean };
type SortKey = 'name' | 'created_at' | 'service' | 'type';
type SortDir = 'asc' | 'desc';

function normalize(value: any) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try { return new Date(value).toLocaleDateString('pt-BR'); } catch { return '-'; }
}

function hasWhatsApp(client: ClientSpreadsheetRow) {
  return Boolean(String(client.whatsapp || client.phone || '').replace(/\D/g, ''));
}

function typeShort(value?: string | null) {
  const normalized = normalize(value);
  if (normalized === 'pessoa juridica') return 'PJ';
  if (normalized === 'pessoa fisica') return 'PF';
  return value || '-';
}

function SortButton(props: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button type="button" className="table-sort" onClick={props.onClick} title={`Ordenar por ${props.label.toLowerCase()}`}>
      <span>{props.label}</span><span>{props.active ? (props.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
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

  const filteredClients = useMemo(() => [...(clients || [])]
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
    }), [clients, searchText, serviceFilter, typeFilter, contactFilter, sortKey, sortDir]);

  const paginatedClients = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredClients.length / pageSize));
    const safePage = Math.min(page, totalPages);
    return filteredClients.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filteredClients, page, pageSize]);

  function resetPage() { setPage(1); }
  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (sortKey === nextKey) { setSortDir((current) => current === 'asc' ? 'desc' : 'asc'); return; }
    setSortKey(nextKey); setSortDir(nextKey === 'created_at' ? 'desc' : 'asc');
  }
  function clearFilters() {
    setSearchText(''); setServiceFilter(''); setTypeFilter('todos'); setContactFilter('todos'); setSortKey('name'); setSortDir('asc'); setPage(1);
  }

  const advancedFilters = (
    <>
      <select className="input compact-input" value={serviceFilter} onChange={(event) => { setServiceFilter(event.target.value); resetPage(); }}>
        <option value="">Todos os serviços</option>
        {services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
      </select>
      <select className="input compact-input" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); resetPage(); }}>
        <option value="todos">Todos os tipos</option><option value="pessoa física">Pessoa física</option><option value="pessoa jurídica">Pessoa jurídica</option>
      </select>
      <select className="input compact-input" value={contactFilter} onChange={(event) => { setContactFilter(event.target.value); resetPage(); }}>
        <option value="todos">Todos os contatos</option><option value="com_whatsapp">Com WhatsApp</option><option value="sem_whatsapp">Sem WhatsApp</option><option value="com_email">Com e-mail</option><option value="sem_email">Sem e-mail</option>
      </select>
      <button type="button" className="btn btn-ghost !min-h-0 !rounded-lg !px-3 !py-2 text-[11px]" onClick={clearFilters}>Limpar filtros</button>
    </>
  );

  return (
    <section className="card mb-5 overflow-hidden">
      <div className="border-b border-[#eee8df] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><h2 className="text-[14px] font-black text-slate-950">Clientes</h2><p className="hidden text-[10px] font-medium text-slate-500 md:block">Pesquisa rápida e organização em uma única linha.</p></div>
          <div className="shrink-0 text-[10px] font-black text-slate-500">{filteredClients.length} de {clients.length}</div>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="field-with-icon min-w-0 flex-1">
            <Search className="field-with-icon__icon text-slate-400" size={14} />
            <input className="input compact-input field-with-icon__input" value={searchText} onChange={(event) => { setSearchText(event.target.value); resetPage(); }} placeholder="Buscar cliente, CPF/CNPJ, telefone ou e-mail" />
          </div>
          <details className="mobile-filter-disclosure md:hidden">
            <summary title="Filtros" aria-label="Filtros"><Filter size={16} /><span>Filtros</span><ChevronDown size={13} className="disclosure-chevron" /></summary>
            <div className="mobile-filter-panel">{advancedFilters}</div>
          </details>
        </div>

        <div className="mt-2 hidden grid-cols-4 gap-2 md:grid">{advancedFilters}</div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="professional-table min-w-[940px] w-full">
          <thead><tr>
            <th><SortButton label="Nome" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} /></th>
            <th>Documento</th><th><SortButton label="Tipo" active={sortKey === 'type'} dir={sortDir} onClick={() => toggleSort('type')} /></th>
            <th><SortButton label="Serviço" active={sortKey === 'service'} dir={sortDir} onClick={() => toggleSort('service')} /></th>
            <th>WhatsApp</th><th>E-mail</th><th><SortButton label="Cadastro" active={sortKey === 'created_at'} dir={sortDir} onClick={() => toggleSort('created_at')} /></th><th>Ações</th>
          </tr></thead>
          <tbody>{paginatedClients.map((client) => (
            <tr key={client.id}>
              <td><Link href={`/app/clientes/${client.id}`} className="table-primary-link" title={client.name || ''}>{client.name || '-'}</Link></td>
              <td>{client.doc || '-'}</td><td>{typeShort(client.client_type)}</td>
              <td><span className="table-ellipsis max-w-[220px]" title={client.legal_services?.name || ''}>{client.legal_services?.name || '-'}</span></td>
              <td>{client.whatsapp || client.phone || '-'}</td><td><span className="table-ellipsis max-w-[230px]" title={client.email || ''}>{client.email || '-'}</span></td>
              <td>{formatDate(client.created_at)}</td>
              <td><div className="table-actions">
                {hasWhatsApp(client) && <Link href={`/app/whatsapp?cliente=${client.id}`} className="icon-action is-whatsapp" title="Abrir WhatsApp"><MessageCircle size={14} /></Link>}
                <Link href={`/app/clientes/${client.id}`} className="icon-action" title="Abrir pasta"><UserRound size={14} /></Link>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="mobile-record-list md:hidden">
        {paginatedClients.map((client) => (
          <details className="mobile-record" key={client.id}>
            <summary>
              <div className="mobile-record-main">
                <strong>{client.name || '-'}</strong>
                <span>{client.legal_services?.name || typeShort(client.client_type)}</span>
              </div>
              <div className="mobile-record-side">
                <span className="mobile-record-meta">{typeShort(client.client_type)}</span><ChevronDown size={15} className="disclosure-chevron" />
              </div>
            </summary>
            <div className="mobile-record-details">
              <div className="mobile-detail-grid">
                <div><span>Documento</span><b>{client.doc || '-'}</b></div><div><span>Cadastro</span><b>{formatDate(client.created_at)}</b></div>
                <div><span>WhatsApp</span><b>{client.whatsapp || client.phone || '-'}</b></div><div><span>E-mail</span><b>{client.email || '-'}</b></div>
                <div className="col-span-2"><span>Serviço</span><b>{client.legal_services?.name || '-'}</b></div>
              </div>
              <div className="mobile-record-actions">
                <Link href={`/app/clientes/${client.id}`} className="btn btn-primary">Abrir cliente</Link>
                {hasWhatsApp(client) && <Link href={`/app/whatsapp?cliente=${client.id}`} className="btn btn-secondary"><MessageCircle size={14} /> WhatsApp</Link>}
              </div>
            </div>
          </details>
        ))}
      </div>

      {!!filteredClients.length && <TablePagination page={page} pageSize={pageSize} totalItems={filteredClients.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      {!filteredClients.length && <div className="p-5 text-[12px] font-bold text-slate-500">Nenhum cliente encontrado.</div>}
    </section>
  );
}
