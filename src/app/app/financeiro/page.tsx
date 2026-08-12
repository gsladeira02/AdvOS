export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR, money } from '@/lib/utils';
import Link from 'next/link';
import { whatsappShareUrl, whatsappUrl } from '@/lib/whatsapp';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES, renderMessageTemplate } from '@/lib/messageTemplates';

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

function buildChargeWhatsappMessage(input: {
  clientName?: string | null;
  installment: any;
  url: string;
  template?: string;
  firmName?: string | null;
  firmPhone?: string | null;
}) {
  const label = installmentLabel(input.installment);
  const defaultTemplate = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.slug === 'cobranca_vencida')?.body || '';

  return renderMessageTemplate(input.template || defaultTemplate, {
    cliente: input.clientName || '',
    parcela: label,
    valor: Number(input.installment.amount || 0),
    vencimento_iso: input.installment.due_date,
    link_asaas: input.url || '',
    escritorio: input.firmName || 'escritório',
    telefone_escritorio: input.firmPhone || '',
  });
}

function statusLabel(status: string) {
  if (status === 'pago') return 'Pago';
  if (status === 'atrasado') return 'Atrasado';
  return 'Pendente';
}

export default async function Financeiro() {
  const { supabase, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const [items, clients, firmRes, templateRes] = await Promise.all([
    supabase
      .from('financial_installments')
      .select('*, financial_contracts(description, clients(id,name,doc,email,phone,whatsapp,asaas_customer_id))')
      .eq('law_firm_id', profile.law_firm_id)
      .order('due_date'),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
    admin.from('law_firms').select('name,phone').eq('id', profile.law_firm_id).maybeSingle(),
    admin.from('message_templates').select('body').eq('law_firm_id', profile.law_firm_id).eq('slug', 'cobranca_vencida').eq('active', true).maybeSingle(),
  ]);

  const installments = items.data || [];
  const firm = firmRes.data as any;
  const chargeTemplate = (templateRes.data as any)?.body || DEFAULT_MESSAGE_TEMPLATES.find((t) => t.slug === 'cobranca_vencida')?.body;
  const total = installments
    .filter((i: any) => i.status !== 'pago')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const overdueTotal = installments
    .filter((i: any) => i.status === 'atrasado')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle={`Pendente: ${money(total)}. Atrasado: ${money(overdueTotal)}. Use o botão de WhatsApp para cobrar parcelas em aberto.`}
      />

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

      <div className="space-y-3">
        {installments.map((i: any) => {
          const client = i.financial_contracts?.clients;
          const url = chargeUrl(i);
          const message = buildChargeWhatsappMessage({ clientName: client?.name, installment: i, url, template: chargeTemplate, firmName: firm?.name, firmPhone: firm?.phone });
          const phone = client?.whatsapp || client?.phone;
          const wa = phone ? whatsappUrl(phone, message) : whatsappShareUrl(message);
          const canCharge = Boolean(wa);
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

                {canCharge ? (
                  <Link href={wa} target="_blank" className="btn btn-primary w-full justify-center">
                    Cobrar no WhatsApp
                  </Link>
                ) : (
                  <button className="btn w-full cursor-not-allowed justify-center opacity-50" disabled>
                    Cobrar no WhatsApp
                  </button>
                )}
              </div>
            </section>
          );
        })}
        {!installments.length && <section className="card p-6 text-slate-500">Nenhuma cobrança cadastrada.</section>}
      </div>
    </div>
  );
}
