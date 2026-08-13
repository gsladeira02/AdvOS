export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { dateBR, deadlineClass, money } from '@/lib/utils';

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    'em andamento': 'Em andamento',
    concluido: 'Concluído',
    concluida: 'Concluída',
  };
  return labels[String(value || '')] || value || '-';
}

export default async function Dashboard() {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const lawFirmId = profile.law_firm_id;
  const [clients, cases, deadlines, tasks, finance] = await Promise.all([
    admin.from('clients').select('id', { count: 'exact', head: true }).eq('law_firm_id', lawFirmId),
    admin.from('cases').select('id,status').eq('law_firm_id', lawFirmId),
    admin.from('deadlines').select('id,title,due_date,status').eq('law_firm_id', lawFirmId).order('due_date').limit(8),
    admin.from('tasks').select('id,title,status,due_date').eq('law_firm_id', lawFirmId).neq('status', 'concluida').limit(6),
    admin.from('financial_installments').select('amount,status').eq('law_firm_id', lawFirmId),
  ]);

  const activeCases = (cases.data || []).filter((caseRow: any) => caseRow.status !== 'arquivado').length;
  const pendingValue = (finance.data || [])
    .filter((item: any) => item.status !== 'pago')
    .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);

  return (
    <div>
      <PageHeader title="Painel principal" subtitle="Visão rápida do escritório hoje." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clientes" value={clients.count || 0} />
        <StatCard label="Processos ativos" value={activeCases} />
        <StatCard label="Próximos prazos" value={deadlines.data?.length || 0} />
        <StatCard label="A receber" value={money(pendingValue)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-xl font-black">Próximos prazos</h2>
          <div className="mt-4 space-y-3">
            {(deadlines.data || []).map((deadline: any) => (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#eee4d4] p-4" key={deadline.id}>
                <div className="min-w-0 flex-1">
                  <b className="break-safe">{deadline.title}</b>
                  <p className="text-sm text-slate-500">{dateBR(deadline.due_date)}</p>
                </div>
                <span className={'badge shrink-0 ' + deadlineClass(deadline.due_date, deadline.status)}>{statusLabel(deadline.status)}</span>
              </div>
            ))}
            {!deadlines.data?.length && <p className="text-slate-500">Nenhum prazo cadastrado.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-black">Tarefas pendentes</h2>
          <div className="mt-4 space-y-3">
            {(tasks.data || []).map((task: any) => (
              <div className="rounded-2xl border border-[#eee4d4] p-4" key={task.id}>
                <b className="break-safe">{task.title}</b>
                <p className="text-sm text-slate-500">Prazo: {dateBR(task.due_date)}</p>
              </div>
            ))}
            {!tasks.data?.length && <p className="text-slate-500">Nenhuma tarefa pendente.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
