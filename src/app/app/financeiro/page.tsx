export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { FinanceiroSpreadsheet } from '@/components/FinanceiroSpreadsheet';
import { getCurrentProfile } from '@/lib/current';
import { money } from '@/lib/utils';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';

export default async function Financeiro() {
  const { supabase, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

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
      .select('id,name,body,category,active,meta_template_name,meta_template_language')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('category', 'cobranca')
      .eq('active', true)
      .order('name'),
  ]);

  const installments = items.data || [];
  const clientsList = clients.data || [];
  const firm = firmRes.data as any;
  const chargeTemplates = (templatesRes.data?.length ? templatesRes.data : DEFAULT_MESSAGE_TEMPLATES.filter((t) => t.category === 'cobranca')).map((template: any) => ({
    id: String(template.id || template.slug || template.name),
    name: String(template.name || 'Modelo de cobrança'),
    body: String(template.body || ''),
    meta_template_name: template.meta_template_name ? String(template.meta_template_name) : '',
    meta_template_language: template.meta_template_language ? String(template.meta_template_language) : 'pt_BR',
  }));

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
        subtitle={`Pendente: ${money(total)} • Atrasado: ${money(overdueTotal)}`}
      />

      <FinanceiroSpreadsheet
        installments={installments}
        clients={clientsList}
        firmName={firm?.name}
        firmPhone={firm?.phone}
        userName={profile.full_name}
        templates={chargeTemplates}
      />

      <section className="card mb-6 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-950">Cadastrar cobrança manual</h2>
          <p className="text-sm text-slate-500">Use quando precisar lançar uma cobrança que ainda não veio do Asaas.</p>
        </div>
        <form action="/api/finance" method="post" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {clientsList.map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <input className="input" name="description" placeholder="Descrição" required />
          <input className="input" name="amount" type="number" step="0.01" placeholder="Valor" required />
          <input className="input" name="due_date" type="date" />
          <select className="input" name="status">
            <option>pendente</option>
            <option>pago</option>
            <option>atrasado</option>
          </select>
          <button className="btn btn-primary md:col-span-2 xl:col-span-5">Cadastrar cobrança</button>
        </form>
      </section>
    </div>
  );
}
