export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { money } from '@/lib/utils';

export default async function Servicos(){
  const {supabase,profile}=await getCurrentProfile();
  const {data}=await supabase
    .from('legal_services')
    .select('*')
    .eq('law_firm_id',profile.law_firm_id)
    .order('created_at',{ascending:false});

  return <div>
    <PageHeader title="Serviços" subtitle="Cadastre os serviços jurídicos prestados pelo escritório para vincular cada cliente ao serviço contratado."/>

    <section className="card mb-6 p-5">
      <form action="/api/services" method="post" className="grid gap-4 md:grid-cols-4">
        <input className="input md:col-span-2" name="name" placeholder="Nome do serviço" required/>
        <input className="input" name="default_amount" type="number" step="0.01" placeholder="Valor padrão"/>
        <select className="input" name="active" defaultValue="true">
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
        <input className="input md:col-span-4" name="description" placeholder="Descrição/objeto padrão do serviço"/>
        <button className="btn btn-primary md:col-span-4">Cadastrar serviço</button>
      </form>
    </section>

    <table className="table">
      <thead><tr><th>Serviço</th><th>Descrição padrão</th><th>Valor padrão</th><th>Status</th></tr></thead>
      <tbody>{(data||[]).map((s:any)=><tr key={s.id}>
        <td><b>{s.name}</b></td>
        <td>{s.description || '-'}</td>
        <td>{money(s.default_amount || 0)}</td>
        <td><span className={`badge ${s.active ? 'badge-ok' : 'badge-warn'}`}>{s.active ? 'ativo' : 'inativo'}</span></td>
      </tr>)}</tbody>
    </table>
    {!data?.length && <p className="mt-4 text-sm text-slate-500">Nenhum serviço cadastrado ainda.</p>}
  </div>
}
