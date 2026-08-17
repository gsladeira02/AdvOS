export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { FinanceiroSpreadsheet } from '@/components/FinanceiroSpreadsheet';
import { ResponsiveFormSection } from '@/components/ResponsiveFormSection';
import { getCurrentProfile } from '@/lib/current';
import { money } from '@/lib/utils';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/finance';

export default async function Financeiro() {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

  const [items, clients, firmRes, templatesRes] = await Promise.all([
    admin
      .from('financial_installments')
      .select('*, financial_contracts(description, clients(id,name,doc,email,phone,whatsapp,asaas_customer_id))')
      .eq('law_firm_id', profile.law_firm_id)
      .order('due_date', { ascending: true }),
    admin.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id).order('name'),
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
        subtitle={`Aguardando pagamento: ${money(total - overdueTotal)} • Em atraso: ${money(overdueTotal)}`}
      />

      <FinanceiroSpreadsheet
        installments={installments}
        clients={clientsList}
        firmName={firm?.name}
        firmPhone={firm?.phone}
        userName={profile.full_name}
        templates={chargeTemplates}
      />

      <ResponsiveFormSection title="Nova cobrança" description="Lançamento manual para cobranças que ainda não vieram do Asaas.">
        <form action="/api/finance" method="post" className="compact-form-grid grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
          <select className="input compact-input" name="client_id"><option value="">Cliente</option>{clientsList.map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
          <input className="input compact-input" name="description" placeholder="Descrição" required />
          <input className="input compact-input" name="amount" type="number" step="0.01" placeholder="Valor" required />
          <input className="input compact-input" name="due_date" type="date" />
          <select className="input compact-input" name="payment_method" defaultValue="">{PAYMENT_METHOD_OPTIONS.map(([value,label]) => <option value={value} key={value || 'none'}>{label}</option>)}</select>
          <select className="input compact-input" name="status"><option value="pendente">Aguardando pagamento</option><option value="atrasado">Em atraso</option><option value="pago">Pagamento recebido</option></select>
          <button className="btn btn-primary md:col-span-2 xl:col-span-6">Cadastrar cobrança</button>
        </form>
      </ResponsiveFormSection>
    </div>
  );
}
