export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR, deadlineClass } from '@/lib/utils';

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    'em andamento': 'Em andamento',
    concluido: 'Concluído',
    concluida: 'Concluída',
  };
  return labels[String(value || '')] || value || '-';
}

function priorityLabel(value?: string) {
  const labels: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  return labels[String(value || '')] || value || '-';
}

export default async function Prazos() {
  const { supabase, profile } = await getCurrentProfile();
  const [deadlines, clients, cases] = await Promise.all([
    supabase.from('deadlines').select('*, clients(name), cases(case_number)').eq('law_firm_id', profile.law_firm_id).order('due_date'),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
    supabase.from('cases').select('id,case_number').eq('law_firm_id', profile.law_firm_id),
  ]);

  const rows = deadlines.data || [];

  return (
    <div>
      <PageHeader title="Prazos" subtitle="Acompanhe vencimentos, responsáveis e prioridades do escritório." />

      <section className="card mb-6 p-5">
        <form action="/api/deadlines" method="post" className="grid gap-4 md:grid-cols-4">
          <input className="input" name="title" placeholder="Título do prazo" required />
          <input className="input" name="due_date" type="date" required />
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <select className="input" name="case_id">
            <option value="">Processo</option>
            {(cases.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.case_number || 'Sem número'}</option>)}
          </select>
          <input className="input" name="responsible" placeholder="Responsável" />
          <select className="input" name="priority" defaultValue="normal">
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select className="input" name="status" defaultValue="pendente">
            <option value="pendente">Pendente</option>
            <option value="em andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
          </select>
          <input className="input" name="description" placeholder="Descrição" />
          <button className="btn btn-primary md:col-span-4">Cadastrar prazo</button>
        </form>
      </section>

      <div className="table-responsive">
        <table className="table min-w-[720px]">
          <thead><tr><th>Prazo</th><th>Data</th><th>Cliente</th><th>Processo</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((d: any) => (
              <tr key={d.id}>
                <td><b className="break-safe">{d.title}</b><p className="text-sm text-slate-500">{priorityLabel(d.priority)}</p></td>
                <td>{dateBR(d.due_date)}</td>
                <td>{d.clients?.name || '-'}</td>
                <td>{d.cases?.case_number || '-'}</td>
                <td><span className={'badge ' + deadlineClass(d.due_date, d.status)}>{statusLabel(d.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-4 text-sm font-medium text-slate-500">Nenhum prazo cadastrado.</p>}
    </div>
  );
}
