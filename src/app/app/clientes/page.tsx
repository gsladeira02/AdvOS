export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { ClientsSpreadsheet } from '@/components/ClientsSpreadsheet';
import { ResponsiveFormSection } from '@/components/ResponsiveFormSection';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export default async function Clientes({ searchParams }: { searchParams?: Promise<Record<string, string>> }){
  const query = await searchParams;
  const {profile}=await getCurrentProfile();
  const admin = createAdminSupabase();
  const [clientsRes, servicesRes] = await Promise.all([
    admin.from('clients').select('*, legal_services(id,name)').eq('law_firm_id',profile.law_firm_id).order('created_at',{ascending:false}),
    admin.from('legal_services').select('id,name,active').eq('law_firm_id',profile.law_firm_id).order('name'),
  ]);

  const services = servicesRes.data || [];
  const clients = clientsRes.data || [];

  const form = <form action="/api/clients" method="post" className="compact-form-grid grid gap-2.5 md:grid-cols-3">
    <input className="input compact-input" name="name" placeholder="Nome completo" required/>
    <input className="input compact-input" name="doc" placeholder="CPF/CNPJ"/>
    <select className="input compact-input" name="client_type"><option>pessoa física</option><option>pessoa jurídica</option></select>
    <input className="input compact-input" name="phone" placeholder="Telefone"/>
    <input className="input compact-input" name="whatsapp" placeholder="WhatsApp"/>
    <input className="input compact-input" name="email" placeholder="E-mail"/>
    <select className="input compact-input" name="service_id"><option value="">Serviço prestado</option>{services.map((s:any)=><option value={s.id} key={s.id}>{s.name}{!s.active ? ' (inativo)' : ''}</option>)}</select>
    <input className="input compact-input" name="address" placeholder="Endereço"/>
    <input className="input compact-input" name="notes" placeholder="Observações"/>
    <button className="btn btn-primary md:col-span-3">Cadastrar cliente</button>
  </form>;

  return <div>
    <PageHeader title="Clientes" subtitle="Base central de clientes, serviços, contatos e documentos."/>
    {query?.salvo && <section className="compact-alert mb-3 border-green-200 bg-green-50 text-green-800">Cliente salvo com sucesso.</section>}
    {query?.erro && <section className="compact-alert mb-3 border-red-200 bg-red-50 text-red-800">Não foi possível salvar o cliente. Revise os dados e tente novamente.</section>}
    {servicesRes.error && <section className="compact-alert mb-3 border-red-200 bg-red-50 text-red-800">Não foi possível carregar os serviços.</section>}
    {clientsRes.error && <section className="compact-alert mb-3 border-red-200 bg-red-50 text-red-800">Não foi possível carregar os clientes.</section>}

    <ResponsiveFormSection title="Novo cliente" description="Cadastro completo; no PWA este formulário fica recolhido.">{form}</ResponsiveFormSection>
    <ClientsSpreadsheet clients={clients} services={services} />
  </div>;
}
