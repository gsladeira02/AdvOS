export const dynamic = 'force-dynamic';

import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';

function when(value?: string | null) {
  if (!value) return '-';
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value)); }
  catch { return value; }
}

function severityLabel(value?: string) {
  return value === 'critical' ? 'Crítico' : value === 'warning' ? 'Atenção' : 'Informativo';
}

export default async function SegurancaPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const query = await searchParams;
  const { page, pageSize, from, to } = parseServerPagination(query);
  const [{ data: events, error, count }, { data: profiles }] = await Promise.all([
    admin.from('security_events').select('*', { count: 'exact' }).eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).range(from, to),
    admin.from('profiles').select('auth_user_id,full_name,email').eq('law_firm_id', profile.law_firm_id),
  ]);
  const totalRows = count || 0;
  const byUser = new Map((profiles || []).map((item: any) => [String(item.auth_user_id || ''), item]));

  return (
    <div>
      <PageHeader title="Segurança" subtitle="Sessões, acesso e trilha de ações sensíveis do AdvOS." />

      <div className="mb-4 grid grid-cols-3 gap-2 md:gap-3">
        <section className="card p-3.5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Acesso</p><p className="mt-1 text-[15px] font-black text-emerald-700">E-mail + senha</p><p className="mt-1 hidden text-[10px] text-slate-500 md:block">Acesso restrito a usuários cadastrados e ativos, com senha forte e sessão controlada.</p></section>
        <section className="card p-3.5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Inatividade</p><p className="mt-1 text-[15px] font-black">60 minutos</p><p className="mt-1 hidden text-[10px] text-slate-500 md:block">A interface encerra a sessão em dispositivo abandonado.</p></section>
        <section className="card p-3.5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Tempo máximo local</p><p className="mt-1 text-[15px] font-black">12 horas</p><p className="mt-1 hidden text-[10px] text-slate-500 md:block">Configure também os limites autoritativos no Supabase Auth.</p></section>
      </div>

      <section className="card p-3.5">
        <div className="mb-4"><h2 className="text-lg font-black">Eventos de segurança</h2><p className="text-sm text-slate-500">Histórico de registros sensíveis, paginado para carregamento mais rápido. Senhas, tokens e conteúdo de documentos não são gravados aqui.</p></div>
        {error ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">A tabela de auditoria ainda não está disponível. Rode a migração de segurança da v9.39.</p>
        ) : (
          <>
          <div className="hidden md:block table-responsive">
            <table className="table professional-table min-w-[880px]">
              <thead><tr><th>Data</th><th>Usuário</th><th>Evento</th><th>Nível</th><th>IP</th><th>Dispositivo</th></tr></thead>
              <tbody>
                {(events || []).map((event: any) => {
                  const user: any = event.auth_user_id ? byUser.get(String(event.auth_user_id)) : null;
                  return <tr key={event.id}>
                    <td className="whitespace-nowrap">{when(event.created_at)}</td>
                    <td><b>{user?.full_name || user?.email || 'Sistema'}</b></td>
                    <td>{event.event_type}</td>
                    <td><span className={`badge ${event.severity === 'critical' ? 'badge-danger' : event.severity === 'warning' ? 'badge-warn' : 'badge-ok'}`}>{severityLabel(event.severity)}</span></td>
                    <td>{event.ip_address || '-'}</td>
                    <td className="max-w-[320px] truncate" title={event.user_agent || ''}>{event.user_agent || '-'}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-record-list md:hidden">
            {(events || []).map((event: any) => {
              const user: any = event.auth_user_id ? byUser.get(String(event.auth_user_id)) : null;
              return <details className="mobile-record" key={event.id}><summary><div className="mobile-record-main"><strong>{event.event_type}</strong><span>{user?.full_name || user?.email || 'Sistema'} · {when(event.created_at)}</span></div><div className="mobile-record-side"><span className={`mobile-status-dot ${event.severity === 'critical' ? 'is-overdue' : event.severity === 'warning' ? 'is-waiting' : 'is-paid'}`}>{severityLabel(event.severity)}</span><ChevronDown size={15} className="disclosure-chevron" /></div></summary><div className="mobile-record-details"><div className="mobile-detail-grid"><div><span>IP</span><b>{event.ip_address || '-'}</b></div><div><span>Data</span><b>{when(event.created_at)}</b></div><div className="col-span-2"><span>Dispositivo</span><b>{event.user_agent || '-'}</b></div></div></div></details>;
            })}
          </div>
          <ServerTablePagination basePath="/app/seguranca" page={page} pageSize={pageSize} totalItems={totalRows} />
          </>
        )}
        {!error && !(events || []).length && <p className="text-sm font-bold text-slate-500">Nenhum evento registrado ainda.</p>}
      </section>
    </div>
  );
}
