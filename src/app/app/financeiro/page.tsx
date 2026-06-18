export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR, money } from '@/lib/utils';
import Link from 'next/link';
import { buildContractLinksMessage, whatsappUrl } from '@/lib/whatsapp';

function statusBadge(status: string) {
  if (status === 'pago') return 'badge-ok';
  if (status === 'atrasado') return 'badge-danger';
  return 'badge-warn';
}

export default async function Financeiro() {
  const { supabase, profile } = await getCurrentProfile();
  const [items, clients] = await Promise.all([
    supabase
      .from('financial_installments')
      .select('*, financial_contracts(description, clients(id,name,doc,email,phone,whatsapp,asaas_customer_id))')
      .eq('law_firm_id', profile.law_firm_id)
      .order('due_date'),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
  ]);

  const total = (items.data || [])
    .filter((i: any) => i.status !== 'pago')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle={`Pendente: ${money(total)}. Gere cobranças no Asaas quando a integração estiver ativa.`} />

      <section className="card mb-6 p-5">
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

      <div className="space-y-4">
        {(items.data || []).map((i: any) => {
          const client = i.financial_contracts?.clients;
          return (
            <section className="card p-5" key={i.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black">{i.financial_contracts?.description}</h2>
                    <span className={`badge ${statusBadge(i.status)}`}>{i.status}</span>
                    {i.provider && <span className="badge badge-info">{i.provider}</span>}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <p><b>Cliente:</b> {client?.name || '-'}</p>
                    <p><b>Vencimento:</b> {dateBR(i.due_date)}</p>
                    <p><b>Valor:</b> {money(i.amount)}</p>
                    <p><b>ID externo:</b> {i.external_id || '-'}</p>
                    <p><b>Link:</b> {i.invoice_url || i.payment_url ? <Link href={i.invoice_url || i.payment_url} target="_blank" className="font-bold text-blue-700">abrir cobrança</Link> : '-'}</p>
                  <p><b>WhatsApp:</b> {(() => { const url = i.invoice_url || i.payment_url || i.bank_slip_url; const wa = whatsappUrl(client?.whatsapp || client?.phone, buildContractLinksMessage({ clientName: client?.name, asaasLinks: [{ label: 'Cobrança de honorários', amount: i.amount, dueDate: i.due_date, url }] })); return wa && url ? <Link href={wa} target="_blank" className="font-bold text-green-700">enviar cobrança</Link> : '-'; })()}</p>
                  </div>
                </div>

                <form action="/api/asaas/create-payment" method="post" className="rounded-2xl border border-[#eee4d4] p-4">
                  <input type="hidden" name="installment_id" value={i.id} />
                  <input type="hidden" name="redirect_to" value="/app/financeiro" />
                  <h3 className="font-black">Asaas</h3>
                  <p className="mt-1 text-xs text-slate-500">Crie ou atualize a cobrança vinculada a esta parcela.</p>
                  <div className="mt-3 grid gap-3">
                    <select className="input" name="billingType" defaultValue="BOLETO">
                      <option value="BOLETO">Boleto</option>
                      <option value="PIX">Pix</option>
                      <option value="UNDEFINED">Cliente escolhe</option>
                    </select>
                    <button className="btn btn-primary w-full">Gerar Asaas</button>
                  </div>
                  {!client?.name && <p className="mt-2 text-xs font-bold text-amber-700">Vincule um cliente antes de gerar cobrança.</p>}
                </form>
              </div>
            </section>
          );
        })}
        {!items.data?.length && <section className="card p-6 text-slate-500">Nenhuma cobrança cadastrada.</section>}
      </div>
    </div>
  );
}
