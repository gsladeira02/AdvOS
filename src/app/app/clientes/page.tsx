export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';

export default async function Clientes(){
  const {supabase,profile}=await getCurrentProfile();
  const {data}=await supabase.from('clients').select('*').eq('law_firm_id',profile.law_firm_id).order('created_at',{ascending:false});

  return <div>
    <PageHeader title="Clientes" subtitle="Cadastro central do escritório. Clique no cliente para abrir a pasta em nuvem."/>
    <section className="card mb-6 p-5">
      <form action="/api/clients" method="post" className="grid gap-4 md:grid-cols-3">
        <input className="input" name="name" placeholder="Nome completo" required/>
        <input className="input" name="doc" placeholder="CPF/CNPJ"/>
        <select className="input" name="client_type"><option>pessoa física</option><option>pessoa jurídica</option></select>
        <input className="input" name="phone" placeholder="Telefone"/>
        <input className="input" name="whatsapp" placeholder="WhatsApp"/>
        <input className="input" name="email" placeholder="E-mail"/>
        <input className="input md:col-span-2" name="address" placeholder="Endereço"/>
        <input className="input" name="notes" placeholder="Observações"/>
        <button className="btn btn-primary md:col-span-3">Cadastrar cliente</button>
      </form>
    </section>
    <table className="table">
      <thead><tr><th>Nome</th><th>Documento</th><th>WhatsApp</th><th>E-mail</th><th>Pasta</th></tr></thead>
      <tbody>{(data||[]).map((c:any)=><tr key={c.id}>
        <td><Link href={`/app/clientes/${c.id}`} className="font-black text-blue-700 hover:underline">{c.name}</Link></td>
        <td>{c.doc}</td>
        <td>{c.whatsapp}</td>
        <td>{c.email}</td>
        <td><Link href={`/app/clientes/${c.id}`} className="btn btn-secondary py-2 text-sm">Abrir pasta</Link></td>
      </tr>)}</tbody>
    </table>
  </div>
}
