export const dynamic = 'force-dynamic';

import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResponsiveFormSection } from '@/components/ResponsiveFormSection';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';
import { money } from '@/lib/utils';

export default async function Servicos({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }){
  const query = await searchParams; const {profile}=await getCurrentProfile(); const admin=createAdminSupabase(); const {page,pageSize,from,to}=parseServerPagination(query);
  const {data,error,count}=await admin.from('legal_services').select('*',{count:'exact'}).eq('law_firm_id',profile.law_firm_id).order('created_at',{ascending:false}).range(from,to);
  const rows=data||[]; const totalRows=count||0;
  const form=<form action="/api/services" method="post" className="compact-form-grid grid gap-2.5 md:grid-cols-4"><input className="input compact-input md:col-span-2" name="name" placeholder="Nome do serviço" required/><input className="input compact-input" name="default_amount" type="number" step="0.01" placeholder="Valor padrão"/><select className="input compact-input" name="active" defaultValue="true"><option value="true">Ativo</option><option value="false">Inativo</option></select><input className="input compact-input md:col-span-4" name="description" placeholder="Descrição/objeto padrão do serviço"/><button className="btn btn-primary md:col-span-4">Cadastrar serviço</button></form>;
  return <div><PageHeader title="Serviços" subtitle="Catálogo de serviços jurídicos e valores padrão."/>
    {query?.salvo&&<section className="compact-alert mb-3 border-green-200 bg-green-50 text-green-800">Serviço salvo com sucesso.</section>}{query?.erro&&<section className="compact-alert mb-3 border-red-200 bg-red-50 text-red-800">Não foi possível salvar o serviço.</section>}{error&&<section className="compact-alert mb-3 border-red-200 bg-red-50 text-red-800">Não foi possível carregar os serviços.</section>}
    <ResponsiveFormSection title="Novo serviço" description="Cadastro de serviço e valor padrão.">{form}</ResponsiveFormSection>
    <div className="hidden md:block table-responsive"><table className="table professional-table min-w-[700px]"><thead><tr><th>Serviço</th><th>Descrição padrão</th><th>Valor padrão</th><th>Status</th></tr></thead><tbody>{rows.map((s:any)=><tr key={s.id}><td><b>{s.name}</b></td><td><span className="table-ellipsis max-w-[520px]" title={s.description||''}>{s.description||'-'}</span></td><td>{money(s.default_amount||0)}</td><td><span className={`badge ${s.active?'badge-ok':'badge-warn'}`}>{s.active?'Ativo':'Inativo'}</span></td></tr>)}</tbody></table></div>
    <div className="mobile-record-list md:hidden">{rows.map((s:any)=><details className="mobile-record" key={s.id}><summary><div className="mobile-record-main"><strong>{s.name}</strong><span>{money(s.default_amount||0)}</span></div><div className="mobile-record-side"><span className={`mobile-status-dot ${s.active?'is-paid':'is-waiting'}`}>{s.active?'Ativo':'Inativo'}</span><ChevronDown size={15} className="disclosure-chevron"/></div></summary><div className="mobile-record-details"><div className="mobile-detail-grid"><div><span>Valor padrão</span><b>{money(s.default_amount||0)}</b></div><div><span>Status</span><b>{s.active?'Ativo':'Inativo'}</b></div><div className="col-span-2"><span>Descrição</span><b>{s.description||'-'}</b></div></div></div></details>)}</div>
    <ServerTablePagination basePath="/app/servicos" page={page} pageSize={pageSize} totalItems={totalRows}/>{!rows.length&&!error&&<p className="empty-state">Nenhum serviço cadastrado.</p>}</div>;
}
