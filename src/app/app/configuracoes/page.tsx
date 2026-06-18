export const dynamic = 'force-dynamic';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentSession } from '@/lib/current';

export default async function Configuracoes(){
  const {supabase,session}=await getCurrentSession();
  const {data:profile}=await supabase.from('profiles').select('*').eq('auth_user_id',session.user.id).maybeSingle();

  if(!profile){
    return <div>
      <PageHeader title="Configurações" subtitle="Finalize os dados iniciais do AdvOS dentro do painel." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form action="/api/setup" method="post" className="card p-8">
          <h1 className="text-3xl font-black">Definir escritório e usuário inicial</h1>
          <p className="mt-2 text-slate-600">Esta configuração fica apenas na aba Configurações. Depois de salvar, o painel principal será liberado.</p>

          <section className="mt-8">
            <h2 className="text-xl font-black">Dados do escritório</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><label className="label">Nome do escritório</label><input name="firm_name" className="input mt-1" required placeholder="Ex: Ladeira Advocacia"/></div>
              <div><label className="label">CNPJ opcional</label><input name="cnpj" className="input mt-1" placeholder="00.000.000/0001-00"/></div>
              <div><label className="label">OAB do responsável</label><input name="oab_responsible" className="input mt-1" placeholder="OAB/ES 000000"/></div>
              <div><label className="label">Telefone comercial</label><input name="firm_phone" className="input mt-1" placeholder="(27) 99999-9999"/></div>
              <div><label className="label">E-mail do escritório</label><input name="firm_email" type="email" className="input mt-1" placeholder="contato@escritorio.com"/></div>
              <div><label className="label">Endereço</label><input name="address" className="input mt-1" placeholder="Cidade - UF"/></div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-black">Dados do usuário inicial</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><label className="label">Nome completo</label><input name="full_name" className="input mt-1" required placeholder="Nome do administrador"/></div>
              <div><label className="label">Celular</label><input name="phone" className="input mt-1" placeholder="(27) 99999-9999"/></div>
              <div><label className="label">OAB do usuário opcional</label><input name="oab_number" className="input mt-1" placeholder="OAB/ES 000000"/></div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-black">Acesso do sistema</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div><label className="label">Plano</label><input name="plan" defaultValue="interno" className="input mt-1"/></div>
              <div><label className="label">Dias de acesso</label><input name="days" type="number" defaultValue="365" min="1" className="input mt-1"/></div>
              <div><label className="label">Tolerância</label><input name="grace_days" type="number" defaultValue="3" min="0" className="input mt-1"/></div>
            </div>
          </section>

          <button className="btn btn-primary mt-8">Salvar configurações</button>
        </form>
        <aside className="card h-fit p-6">
          <h2 className="text-xl font-black">Fluxo interno</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li><b>1.</b> O primeiro usuário é criado no Supabase Auth.</li>
            <li><b>2.</b> O usuário entra normalmente no AdvOS.</li>
            <li><b>3.</b> A configuração do escritório aparece só nesta aba.</li>
            <li><b>4.</b> Depois, os demais usuários são criados em Usuários.</li>
          </ol>
        </aside>
      </div>
    </div>
  }

  const {data:firm}=await supabase.from('law_firms').select('*').eq('id',profile.law_firm_id).maybeSingle();
  const {data:sub}=await supabase.from('subscriptions').select('*').eq('law_firm_id',profile.law_firm_id).maybeSingle();

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
