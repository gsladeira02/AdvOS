export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export default async function Clientes({ searchParams }: { searchParams?: Promise<Record<string, string>> }){
  const query = await searchParams;
  const {profile}=await getCurrentProfile();
  const admin = createAdminSupabase();
  const [clientsRes, servicesRes] = await Promise.all([
    admin
      .from('clients')
      .select('*, legal_services(name)')
      .eq('law_firm_id',profile.law_firm_id)
      .order('created_at',{ascending:false}),
    admin
      .from('legal_services')
      .select('id,name,active')
      .eq('law_firm_id',profile.law_firm_id)
      .order('name'),
  ]);

  const services = servicesRes.data || [];

  return <div>
    <PageHeader title="Clientes" subtitle="Cadastro central do escritório. Clique no cliente para abrir a pasta em nuvem, gerar documentos e criar cobranças."/>
    {query?.salvo && <section className="card mb-6 border-green-200 bg-green-50 p-4 text-sm text-green-800">Cliente salvo com sucesso.</section>}
    {query?.erro && <section className="card mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-800">Erro ao salvar cliente: {decodeURIComponent(query.erro)}</section>}
    {servicesRes.error && <section className="card mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-800">Erro ao carregar serviços: {servicesRes.error.message}. Confira se o SQL <b>v8_migration.sql</b> foi rodado no Supabase.</section>}
    <section className="card mb-6 p-5">
      <form action="/api/clients" method="post" className="grid gap-4 md:grid-cols-3">
        <input className="input" name="name" placeholder="Nome completo" required/>
        <input className="input" name="doc" placeholder="CPF/CNPJ"/>
        <select className="input" name="client_type"><option>pessoa física</option><option>pessoa jurídica</option></select>
        <input className="input" name="phone" placeholder="Telefone"/>
        <input className="input" name="whatsapp" placeholder="WhatsApp"/>
        <input className="input" name="email" placeholder="E-mail"/>
        <select className="input" name="service_id">
          <option value="">Serviço prestado</option>
          {services.map((s:any)=><option value={s.id} key={s.id}>{s.name}{!s.active ? ' (inativo)' : ''}</option>)}
        </select>
        <input className="input" name="address" placeholder="Endereço"/>
        <input className="input" name="notes" placeholder="Observações"/>
        <button className="btn btn-primary md:col-span-3">Cadastrar cliente</button>
      </form>
      {!services.length && <p className="mt-3 text-sm text-slate-500">Cadastre serviços na aba Serviços para vincular o tipo de trabalho prestado a cada cliente.</p>}
    </section>
    <table className="table">
      <thead><tr><th>Nome</th><th>Documento</th><th>Serviço</th><th>WhatsApp</th><th>E-mail</th><th>Pasta</th></tr></thead>
      <tbody>{(clientsRes.data||[]).map((c:any)=><tr key={c.id}>
        <td><Link href={`/app/clientes/${c.id}`} className="font-black text-blue-700 hover:underline">{c.name}</Link></td>
        <td>{c.doc}</td>
        <td>{c.legal_services?.name || '-'}</td>
        <td>{c.whatsapp}</td>
        <td>{c.email}</td>
        <td><Link href={`/app/clientes/${c.id}`} className="btn btn-secondary py-2 text-sm">Abrir pasta</Link></td>
      </tr>)}</tbody>
    </table>
  </div>
}
