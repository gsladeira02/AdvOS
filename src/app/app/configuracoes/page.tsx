import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';

export default async function Configuracoes(){
  const {supabase,profile}=await getCurrentProfile();
  const {data:firm}=await supabase.from('law_firms').select('*').eq('id',profile.law_firm_id).single();
  const {data:sub}=await supabase.from('subscriptions').select('*').eq('law_firm_id',profile.law_firm_id).single();

  return <div>
    <PageHeader title="Configurações" subtitle="Dados do escritório, acesso e usuário logado." />
    <div className="grid gap-6 lg:grid-cols-2">
      <form action="/api/settings" method="post" className="card p-6">
        <input type="hidden" name="section" value="firm" />
        <h2 className="text-xl font-black">Escritório</h2>
        <div className="mt-5 space-y-4">
          <div><label className="label">Nome do escritório</label><input name="name" defaultValue={firm?.name||''} className="input mt-1" required /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">CNPJ</label><input name="cnpj" defaultValue={firm?.cnpj||''} className="input mt-1" /></div>
            <div><label className="label">OAB responsável</label><input name="oab_responsible" defaultValue={firm?.oab_responsible||''} className="input mt-1" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Telefone</label><input name="phone" defaultValue={firm?.phone||''} className="input mt-1" /></div>
            <div><label className="label">E-mail</label><input name="email" defaultValue={firm?.email||''} className="input mt-1" /></div>
          </div>
          <div><label className="label">Endereço</label><input name="address" defaultValue={firm?.address||''} className="input mt-1" /></div>
        </div>
        <button className="btn btn-primary mt-6">Salvar escritório</button>
      </form>

      <form action="/api/settings" method="post" className="card p-6">
        <input type="hidden" name="section" value="profile" />
        <h2 className="text-xl font-black">Meu usuário</h2>
        <div className="mt-5 space-y-4">
          <div><label className="label">Nome completo</label><input name="full_name" defaultValue={profile.full_name||''} className="input mt-1" required /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">E-mail</label><input value={profile.email||''} className="input mt-1 bg-slate-50" readOnly /></div>
            <div><label className="label">Celular</label><input name="phone" defaultValue={profile.phone||''} className="input mt-1" /></div>
          </div>
          <div><label className="label">OAB</label><input name="oab_number" defaultValue={profile.oab_number||''} className="input mt-1" /></div>
        </div>
        <button className="btn btn-primary mt-6">Salvar usuário</button>
      </form>

      <form action="/api/settings" method="post" className="card p-6 lg:col-span-2">
        <input type="hidden" name="section" value="subscription" />
        <h2 className="text-xl font-black">Acesso interno</h2>
        <p className="mt-1 text-sm text-slate-500">Na V1, isto serve para controlar o período de uso do escritório sem checkout obrigatório.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div><label className="label">Plano</label><input name="plan" defaultValue={sub?.plan||'interno'} className="input mt-1" /></div>
          <div><label className="label">Status</label><select name="status" defaultValue={sub?.status||'ativa'} className="input mt-1"><option value="ativa">Ativa</option><option value="vencida">Vencida</option><option value="suspensa">Suspensa</option></select></div>
          <div><label className="label">Fim do período</label><input name="current_period_end" type="date" defaultValue={sub?.current_period_end||''} className="input mt-1" /></div>
          <div><label className="label">Tolerância até</label><input name="grace_until" type="date" defaultValue={sub?.grace_until||''} className="input mt-1" /></div>
        </div>
        <button className="btn btn-primary mt-6">Salvar acesso</button>
      </form>
    </div>
  </div>
}
