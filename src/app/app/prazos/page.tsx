export const dynamic = 'force-dynamic';

import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResponsiveFormSection } from '@/components/ResponsiveFormSection';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';
import { dateBR, deadlineClass } from '@/lib/utils';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { pendente: 'Pendente', 'em andamento': 'Em andamento', concluido: 'Concluído', concluida: 'Concluída' };
  return labels[String(value || '')] || value || '-';
}
function priorityLabel(value?: string) { const labels: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }; return labels[String(value || '')] || value || '-'; }

export default async function Prazos({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const query = await searchParams;
  const { page, pageSize, from, to } = parseServerPagination(query);
  const [deadlines, clients, cases] = await Promise.all([
    admin.from('deadlines').select('*, clients(name), cases(case_number)', { count: 'exact' }).eq('law_firm_id', profile.law_firm_id).order('due_date').range(from, to),
    admin.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
    admin.from('cases').select('id,case_number').eq('law_firm_id', profile.law_firm_id),
  ]);
  const rows = deadlines.data || [];
  const totalRows = deadlines.count || 0;

  const form = <form action="/api/deadlines" method="post" className="compact-form-grid grid gap-2.5 md:grid-cols-4">
    <input className="input compact-input" name="title" placeholder="Título do prazo" required />
    <input className="input compact-input" name="due_date" type="date" required />
    <select className="input compact-input" name="client_id"><option value="">Cliente</option>{(clients.data || []).map((c:any)=><option value={c.id} key={c.id}>{c.name}</option>)}</select>
    <select className="input compact-input" name="case_id"><option value="">Processo</option>{(cases.data || []).map((c:any)=><option value={c.id} key={c.id}>{c.case_number || 'Sem número'}</option>)}</select>
    <input className="input compact-input" name="responsible" placeholder="Responsável" />
    <select className="input compact-input" name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>
    <select className="input compact-input" name="status" defaultValue="pendente"><option value="pendente">Pendente</option><option value="em andamento">Em andamento</option><option value="concluido">Concluído</option></select>
    <input className="input compact-input" name="description" placeholder="Descrição" />
    <button className="btn btn-primary md:col-span-4">Cadastrar prazo</button>
  </form>;

  return <div>
    <PageHeader title="Prazos" subtitle="Vencimentos, responsáveis e prioridades em ordem cronológica." />
    <ResponsiveFormSection title="Novo prazo" description="Cadastre um vencimento sem ocupar espaço permanente no PWA.">{form}</ResponsiveFormSection>

    <div className="hidden md:block table-responsive"><table className="table professional-table min-w-[760px]"><thead><tr><th>Prazo</th><th>Data</th><th>Cliente</th><th>Processo</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>
      {rows.map((d:any)=><tr key={d.id}><td><b className="table-ellipsis max-w-[260px]">{d.title}</b></td><td>{dateBR(d.due_date)}</td><td><span className="table-ellipsis max-w-[180px]">{d.clients?.name || '-'}</span></td><td>{d.cases?.case_number || '-'}</td><td>{priorityLabel(d.priority)}</td><td><span className={'badge ' + deadlineClass(d.due_date,d.status)}>{statusLabel(d.status)}</span></td></tr>)}
    </tbody></table></div>

    <div className="mobile-record-list md:hidden">{rows.map((d:any)=><details className="mobile-record" key={d.id}><summary><div className="mobile-record-main"><strong>{d.title}</strong><span>{d.clients?.name || 'Sem cliente'} · {priorityLabel(d.priority)}</span></div><div className="mobile-record-side"><strong>{dateBR(d.due_date)}</strong><span className={'mobile-status-dot ' + (String(d.status).startsWith('conclu') ? 'is-paid' : '')}>{statusLabel(d.status)}</span><ChevronDown size={15} className="disclosure-chevron" /></div></summary><div className="mobile-record-details"><div className="mobile-detail-grid"><div><span>Cliente</span><b>{d.clients?.name || '-'}</b></div><div><span>Processo</span><b>{d.cases?.case_number || '-'}</b></div><div><span>Responsável</span><b>{d.responsible || '-'}</b></div><div><span>Prioridade</span><b>{priorityLabel(d.priority)}</b></div>{d.description && <div className="col-span-2"><span>Descrição</span><b>{d.description}</b></div>}</div></div></details>)}</div>

    <ServerTablePagination basePath="/app/prazos" page={page} pageSize={pageSize} totalItems={totalRows} />
    {!rows.length && <p className="empty-state">Nenhum prazo cadastrado.</p>}
  </div>;
}
