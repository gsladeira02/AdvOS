export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR } from '@/lib/utils';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { pendente: 'Pendente', 'em andamento': 'Em andamento', concluida: 'Concluída', concluido: 'Concluído' };
  return labels[String(value || '')] || value || '-';
}

function priorityLabel(value?: string) {
  const labels: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
  return labels[String(value || '')] || value || '-';
}

export default async function Tarefas() {
  const { supabase, profile } = await getCurrentProfile();
  const [tasks, clients, cases] = await Promise.all([
    supabase.from('tasks').select('*, clients(name), cases(case_number)').eq('law_firm_id', profile.law_firm_id).order('due_date'),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
    supabase.from('cases').select('id,case_number').eq('law_firm_id', profile.law_firm_id),
  ]);

  const rows = tasks.data || [];

  return (
    <div>
      <PageHeader title="Tarefas" subtitle="Organize as atividades internas, responsáveis e datas de entrega." />

      <section className="card mb-6 p-5">
        <form action="/api/task" method="post" className="grid gap-4 md:grid-cols-4">
          <input className="input" name="title" placeholder="Título da tarefa" required />
          <input className="input" name="responsible" placeholder="Responsável" />
          <input className="input" name="due_date" type="date" />
          <select className="input" name="priority" defaultValue="normal">
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <select className="input" name="case_id">
            <option value="">Processo</option>
            {(cases.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.case_number || 'Sem número'}</option>)}
          </select>
          <select className="input" name="status" defaultValue="pendente">
            <option value="pendente">Pendente</option>
            <option value="em andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
          </select>
          <input className="input" name="description" placeholder="Descrição" />
          <button className="btn btn-primary md:col-span-4">Cadastrar tarefa</button>
        </form>
      </section>

      <div className="table-responsive">
        <table className="table min-w-[720px]">
          <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Cliente</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((t: any) => (
              <tr key={t.id}>
                <td><b className="break-safe">{t.title}</b><p className="text-sm text-slate-500">{priorityLabel(t.priority)}</p></td>
                <td>{t.responsible || '-'}</td>
                <td>{dateBR(t.due_date)}</td>
                <td>{t.clients?.name || '-'}</td>
                <td><span className="badge badge-info">{statusLabel(t.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-4 text-sm font-medium text-slate-500">Nenhuma tarefa cadastrada.</p>}
    </div>
  );
}
