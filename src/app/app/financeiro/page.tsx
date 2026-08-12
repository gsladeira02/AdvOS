export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR, money } from '@/lib/utils';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';
import { FinanceWhatsappCharge } from '@/components/FinanceWhatsappCharge';

function statusBadge(status: string) {
  if (status === 'pago') return 'badge-ok';
  if (status === 'atrasado') return 'badge-danger';
  return 'badge-warn';
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

function statusLabel(status: string) {
  if (status === 'pago') return 'Pago';
  if (status === 'atrasado') return 'Atrasado';
  return 'Pendente';
}

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

export default async function Financeiro({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = (await searchParams) || {};
  const { supabase, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

  const selectedClient = query.cliente || '';
  const selectedStatus = query.status || 'em_aberto';
  const selectedOrder = query.ordem || 'vencimento_asc';
  const dateFrom = query.data_inicio || '';
  const dateTo = query.data_fim || '';
  const searchText = query.busca || '';

  const [items, clients, firmRes, templatesRes] = await Promise.all([
    supabase
      .from('financial_installments')
      .select('*, financial_contracts(description, clients(id,name,doc,email,phone,whatsapp,asaas_customer_id))')
      .eq('law_firm_id', profile.law_firm_id)
      .order('due_date', { ascending: true }),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id).order('name'),
    admin.from('law_firms').select('name,phone').eq('id', profile.law_firm_id).maybeSingle(),
    admin
      .from('message_templates')
      .select('id,name,body,category,active')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('category', 'cobranca')
      .eq('active', true)
      .order('name'),
  ]);

  const installments = items.data || [];
  const firm = firmRes.data as any;
  const chargeTemplates = (templatesRes.data?.length ? templatesRes.data : DEFAULT_MESSAGE_TEMPLATES.filter((t) => t.category === 'cobranca')).map((template: any) => ({
    id: String(template.id || template.slug || template.name),
    name: String(template.name || 'Modelo de cobrança'),
    body: String(template.body || ''),
  }));

  const total = installments
    .filter((i: any) => i.status !== 'pago')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const overdueTotal = installments
    .filter((i: any) => i.status === 'atrasado')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const filteredInstallments = installments
    .filter((i: any) => {
      const client = i.financial_contracts?.clients;
      const label = installmentLabel(i);
      const haystack = normalize(`${client?.name || ''} ${label} ${i.status || ''} ${i.external_id || ''}`);
      const due = String(i.due_date || '');

      if (selectedClient && client?.id !== selectedClient) return false;
      if (selectedStatus === 'em_aberto' && i.status === 'pago') return false;
      if (selectedStatus !== 'todos' && selectedStatus !== 'em_aberto' && i.status !== selectedStatus) return false;
      if (dateFrom && due < dateFrom) return false;
      if (dateTo && due > dateTo) return false;
      if (searchText && !haystack.includes(normalize(searchText))) return false;

      return true;
    })
    .sort((a: any, b: any) => {
      if (selectedOrder === 'vencimento_desc') return toTime(b.due_date) - toTime(a.due_date);
      if (selectedOrder === 'valor_desc') return Number(b.amount || 0) - Number(a.amount || 0);
      if (selectedOrder === 'valor_asc') return Number(a.amount || 0) - Number(b.amount || 0);
      return toTime(a.due_date) - toTime(b.due_date);
    });

  const filteredTotal = filteredInstallments.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const hasFilters = Boolean(selectedClient || selectedStatus !== 'em_aberto' || selectedOrder !== 'vencimento_asc' || dateFrom || dateTo || searchText);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle={`Pendente: ${money(total)}. Atrasado: ${money(overdueTotal)}. Filtre e ordene as cobranças para fazer a cobrança pelo WhatsApp.`}
      />

      <section className="card mb-6 p-5">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Filtros</h2>
            <p className="text-sm text-slate-500">Encontre parcelas por cliente, status, período e ordene pela data de vencimento.</p>
          </div>
          <div className="text-sm font-bold text-slate-600">
            {filteredInstallments.length} cobrança(s) • {money(filteredTotal)}
          </div>
        </div>

        <form method="get" action="/app/financeiro" className="grid gap-4 md:grid-cols-6">
          <select className="input md:col-span-2" name="cliente" defaultValue={selectedClient}>
            <option value="">Todos os clientes</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>

          <select className="input" name="status" defaultValue={selectedStatus}>
            <option value="em_aberto">Em aberto</option>
            <option value="atrasado">Atrasadas</option>
            <option value="pendente">Pendentes</option>
            <option value="pago">Pagas</option>
            <option value="todos">Todas</option>
          </select>

          <select className="input" name="ordem" defaultValue={selectedOrder}>
            <option value="vencimento_asc">Vencimento: mais antigas</option>
            <option value="vencimento_desc">Vencimento: mais recentes</option>
            <option value="valor_desc">Valor: maior primeiro</option>
            <option value="valor_asc">Valor: menor primeiro</option>
          </select>

          <input className="input" name="data_inicio" type="date" defaultValue={dateFrom} title="Data inicial" />
          <input className="input" name="data_fim" type="date" defaultValue={dateTo} title="Data final" />
          <input className="input md:col-span-4" name="busca" placeholder="Buscar por cliente, parcela ou ID Asaas" defaultValue={searchText} />

          <button className="btn btn-primary md:col-span-1">Aplicar filtros</button>
          {hasFilters ? (
            <Link href="/app/financeiro" className="btn btn-secondary justify-center md:col-span-1">Limpar</Link>
          ) : (
            <span className="hidden md:block" />
          )}
        </form>
      </section>

      <section className="card mb-6 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-950">Cadastrar cobrança manual</h2>
          <p className="text-sm text-slate-500">Use quando precisar lançar uma cobrança que ainda não veio do Asaas.</p>
        </div>
        <form action="/api/finance" method="post" className="grid gap-4 md:grid-cols-5">
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <input className="input" name="description" placeholder="Descrição" required />
          <input className="input" name="amount" type="number" step="0.01" placeholder="Valor" required />
          <input className="input" name="due_date" type="date" />
          <select className="input" name="status">
            <option>pendente</option>
            <option>pago</option>
            <option>atrasado</option>
          </select>
          <button className="btn btn-primary md:col-span-5">Cadastrar cobrança</button>
        </form>
      </section>

      <div className="space-y-3">
        {filteredInstallments.map((i: any) => {
          const client = i.financial_contracts?.clients;
          const url = chargeUrl(i);
          const phone = client?.whatsapp || client?.phone;
          const label = installmentLabel(i);

          return (
            <section className="card p-4" key={i.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${statusBadge(i.status)}`}>{statusLabel(i.status)}</span>
                    {i.provider && <span className="badge badge-info">{i.provider}</span>}
                  </div>

                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cliente</p>
                      <p className="truncate font-black text-slate-900">{client?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Vencimento</p>
                      <p className="font-black text-slate-900">{dateBR(i.due_date)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Valor</p>
                      <p className="font-black text-slate-900">{money(i.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Parcela</p>
                      <p className="truncate font-black text-slate-900" title={label}>{label}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {url ? (
                      <Link href={url} target="_blank" className="font-bold text-blue-700">abrir cobrança Asaas</Link>
                    ) : (
                      <span>Sem link Asaas importado — a mensagem será enviada sem link de pagamento</span>
                    )}
                    {i.external_id && <span>ID Asaas: {i.external_id}</span>}
                    {!client?.whatsapp && !client?.phone && <span className="font-bold text-amber-700">Cliente sem WhatsApp/telefone — o WhatsApp abrirá sem destinatário para você escolher manualmente</span>}
                  </div>
                </div>

                <FinanceWhatsappCharge
                  paid={i.status === 'pago'}
                  clientName={client?.name}
                  phone={phone}
                  installmentLabel={label}
                  amount={Number(i.amount || 0)}
                  dueDate={i.due_date}
                  asaasUrl={url}
                  firmName={firm?.name}
                  firmPhone={firm?.phone}
                  templates={chargeTemplates}
                />
              </div>
            </section>
          );
        })}
        {!filteredInstallments.length && <section className="card p-6 text-slate-500">Nenhuma cobrança encontrada com esses filtros.</section>}
      </div>
    </div>
  );
}
