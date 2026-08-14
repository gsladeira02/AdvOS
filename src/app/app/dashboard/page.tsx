export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { OfficeDashboardCharts } from '@/components/OfficeDashboardCharts';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadWhatsappDashboard } from '@/lib/whatsappDashboard';
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

function brazilNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastSixMonths() {
  const now = brazilNow();
  const rows: Array<{ key: string; label: string; received: number }> = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    rows.push({
      key: monthKey(date),
      label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      received: 0,
    });
  }
  return rows;
}

export default async function Dashboard() {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const lawFirmId = profile.law_firm_id;

  const [clientsRes, casesRes, deadlinesRes, tasksRes, financeRes, servicesRes, whatsappResult] = await Promise.all([
    admin.from('clients').select('id,service_id,created_at').eq('law_firm_id', lawFirmId),
    admin.from('cases').select('id,status').eq('law_firm_id', lawFirmId),
    admin.from('deadlines').select('id,title,due_date,status').eq('law_firm_id', lawFirmId).order('due_date').limit(8),
    admin.from('tasks').select('id,title,status,due_date').eq('law_firm_id', lawFirmId).neq('status', 'concluida').limit(6),
    admin.from('financial_installments').select('id,amount,status,due_date,paid_at,updated_at,created_at').eq('law_firm_id', lawFirmId),
    admin.from('legal_services').select('id,name,active').eq('law_firm_id', lawFirmId).order('name'),
    loadWhatsappDashboard(admin, lawFirmId).then((data) => ({ ok: true as const, data })).catch((error) => {
      console.error('Dashboard geral: não foi possível carregar métricas do WhatsApp:', error);
      return { ok: false as const, data: null };
    }),
  ]);

  const clients = clientsRes.data || [];
  const cases = casesRes.data || [];
  const deadlines = deadlinesRes.data || [];
  const tasks = tasksRes.data || [];
  const finance = financeRes.data || [];
  const services = servicesRes.data || [];
  const whatsappDashboard = whatsappResult.data;

  const activeCases = cases.filter((row: any) => row.status !== 'arquivado').length;
  const waitingRows = finance.filter((item: any) => item.status === 'pendente');
  const overdueRows = finance.filter((item: any) => item.status === 'atrasado');
  const waitingValue = waitingRows.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const overdueValue = overdueRows.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const receivableValue = waitingValue + overdueValue;

  const currentMonth = monthKey(brazilNow());
  const receivedThisMonth = finance
    .filter((item: any) => {
      if (item.status !== 'pago') return false;
      const paidDate = String(item.paid_at || item.updated_at || item.created_at || '');
      return paidDate.slice(0, 7) === currentMonth;
    })
    .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);

  const financeMonths = lastSixMonths();
  const monthMap = new Map(financeMonths.map((item) => [item.key, item]));
  for (const item of finance) {
    if (item.status !== 'pago') continue;
    const paidDate = String(item.paid_at || item.updated_at || item.created_at || '');
    const row = monthMap.get(paidDate.slice(0, 7));
    if (row) row.received += Number(item.amount || 0);
  }

  const serviceCountMap = new Map<string, number>();
  for (const client of clients as any[]) {
    const serviceId = String(client.service_id || '');
    if (!serviceId) continue;
    serviceCountMap.set(serviceId, (serviceCountMap.get(serviceId) || 0) + 1);
  }
  const servicesChart = services
    .map((service: any) => ({ id: String(service.id), name: String(service.name || 'Serviço'), count: serviceCountMap.get(String(service.id)) || 0 }))
    .filter((service: any) => service.count > 0)
    .sort((a: any, b: any) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 8);

  const leadsByStage = (whatsappDashboard?.leads?.byStage || [])
    .filter((stage: any) => stage.active !== false || Number(stage.count || 0) > 0)
    .map((stage: any) => ({ key: String(stage.key), name: String(stage.name), count: Number(stage.count || 0), color: stage.color }));

  return (
    <div>
      <PageHeader
        title="Painel geral"
        subtitle="Visão consolidada do escritório: leads, serviços, financeiro, processos e rotina operacional."
        action={<Link href="/app/whatsapp" className="btn btn-secondary"><MessageCircle size={15} /> Abrir WhatsApp</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads em aberto" value={whatsappDashboard?.leads?.open || 0} detail={`${whatsappDashboard?.leads?.converted30d || 0} convertido(s) em 30 dias • ${whatsappDashboard?.leads?.conversionRate || 0}% conversão`} />
        <StatCard label="A receber" value={money(receivableValue)} detail={`${waitingRows.length + overdueRows.length} cobrança(s) em aberto`} />
        <StatCard label="Recebido no mês" value={money(receivedThisMonth)} detail="Pagamentos recebidos no mês atual" />
        <StatCard label="Em atraso" value={money(overdueValue)} detail={`${overdueRows.length} cobrança(s) vencida(s)`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clientes" value={clients.length} detail={`${clients.filter((client: any) => client.service_id).length} com serviço vinculado`} />
        <StatCard label="Serviços ativos" value={services.filter((service: any) => service.active !== false).length} detail={`${services.length} serviço(s) cadastrado(s)`} />
        <StatCard label="Processos ativos" value={activeCases} />
        <StatCard label="Conversas não lidas" value={whatsappDashboard?.conversations?.unreadMessages || 0} detail={`${whatsappDashboard?.conversations?.unreadConversations || 0} conversa(s)`} />
      </div>

      <div className="mt-6">
        <OfficeDashboardCharts
          leadsByStage={leadsByStage}
          services={servicesChart}
          financeMonths={financeMonths}
          waitingValue={waitingValue}
          overdueValue={overdueValue}
        />
      </div>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Operação do WhatsApp</h2>
            <p className="text-xs font-semibold text-slate-500">Os indicadores que ficavam no Dashboard do WhatsApp agora fazem parte do painel geral.</p>
          </div>
          <Link href="/app/whatsapp" className="inline-flex items-center gap-1 text-xs font-black text-[#075e54] hover:underline">Ir para atendimento <ArrowRight size={13} /></Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-[10px] font-black uppercase text-emerald-700">Atendimento</p><p className="mt-1 text-2xl font-black text-emerald-950">{whatsappDashboard?.conversations?.atendimento || 0}</p><p className="mt-1 text-[10px] font-semibold text-emerald-700">conversas ativas</p></div>
          <div className="rounded-2xl bg-indigo-50 p-4"><p className="text-[10px] font-black uppercase text-indigo-700">Financeiro/Jurídico</p><p className="mt-1 text-2xl font-black text-indigo-950">{whatsappDashboard?.conversations?.financeiroJuridico || 0}</p><p className="mt-1 text-[10px] font-semibold text-indigo-700">conversas ativas</p></div>
          <div className="rounded-2xl bg-slate-100 p-4"><p className="text-[10px] font-black uppercase text-slate-600">Encerradas</p><p className="mt-1 text-2xl font-black text-slate-950">{whatsappDashboard?.conversations?.closed || 0}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">histórico preservado</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><p className="text-[10px] font-black uppercase text-amber-700">Novos leads · 30 dias</p><p className="mt-1 text-2xl font-black text-amber-950">{whatsappDashboard?.leads?.new30d || 0}</p><p className="mt-1 text-[10px] font-semibold text-amber-700">entradas pelo WhatsApp</p></div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Próximos prazos</h2>
            <Link href="/app/prazos" className="inline-flex items-center gap-1 text-xs font-black text-[#075e54] hover:underline">Ver todos <ArrowRight size={13} /></Link>
          </div>
          <div className="mt-4 space-y-3">
            {deadlines.map((deadline: any) => (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#eee4d4] p-4" key={deadline.id}>
                <div className="min-w-0 flex-1">
                  <b className="break-safe">{deadline.title}</b>
                  <p className="text-sm text-slate-500">{dateBR(deadline.due_date)}</p>
                </div>
                <span className={'badge shrink-0 ' + deadlineClass(deadline.due_date, deadline.status)}>{statusLabel(deadline.status)}</span>
              </div>
            ))}
            {!deadlines.length && <p className="text-slate-500">Nenhum prazo cadastrado.</p>}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Tarefas pendentes</h2>
            <Link href="/app/tarefas" className="inline-flex items-center gap-1 text-xs font-black text-[#075e54] hover:underline">Ver todas <ArrowRight size={13} /></Link>
          </div>
          <div className="mt-4 space-y-3">
            {tasks.map((task: any) => (
              <div className="rounded-2xl border border-[#eee4d4] p-4" key={task.id}>
                <b className="break-safe">{task.title}</b>
                <p className="text-sm text-slate-500">Prazo: {dateBR(task.due_date)}</p>
              </div>
            ))}
            {!tasks.length && <p className="text-slate-500">Nenhuma tarefa pendente.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
