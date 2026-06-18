'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function ConfiguracaoInicial(){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault(); setLoading(true); setError('');
    const form=new FormData(e.currentTarget);
    const res=await fetch('/api/setup',{method:'POST',body:form});
    setLoading(false);
    if(!res.ok){const data=await res.json().catch(()=>({error:'Erro ao salvar configuração.'})); setError(data.error||'Erro ao salvar configuração.'); return;}
    window.location.href='/app/dashboard';
  }
  return <main className="min-h-screen bg-soft px-6 py-10">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-xl font-black text-white">A</div>
        <div><b className="text-xl">AdvOS</b><p className="text-xs font-bold text-slate-500">Configuração inicial</p></div>
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="card p-8">
          <h1 className="text-3xl font-black">Definir escritório e usuário inicial</h1>
          <p className="mt-2 text-slate-600">Use esta tela depois de criar o primeiro usuário em Authentication &gt; Users no Supabase e fazer login com ele.</p>

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

          {error&&<p className="mt-6 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button className="btn btn-primary mt-8" disabled={loading}>{loading?'Salvando...':'Salvar e entrar no AdvOS'}</button>
        </form>
        <aside className="card h-fit p-6">
          <h2 className="text-xl font-black">Como funciona</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li><b>1.</b> Você cria só o usuário no Supabase Auth.</li>
            <li><b>2.</b> Faz login no AdvOS com esse usuário.</li>
            <li><b>3.</b> Preenche esta tela uma única vez.</li>
            <li><b>4.</b> O sistema cria o escritório, a assinatura e o perfil automaticamente.</li>
          </ol>
          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Depois disso, os outros usuários são criados dentro de Usuários, sem mexer no Supabase.</p>
        </aside>
      </div>
    </div>
  </main>
}
