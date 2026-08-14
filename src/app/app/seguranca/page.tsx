export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function when(value?: string | null) {
  if (!value) return '-';
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value)); }
  catch { return value; }
}

function severityLabel(value?: string) {
  return value === 'critical' ? 'Crítico' : value === 'warning' ? 'Atenção' : 'Informativo';
}

export default async function SegurancaPage() {
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const [{ data: events, error }, { data: profiles }] = await Promise.all([
    admin.from('security_events').select('*').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).limit(200),
    admin.from('profiles').select('auth_user_id,full_name,email').eq('law_firm_id', profile.law_firm_id),
  ]);
  const byUser = new Map((profiles || []).map((item: any) => [String(item.auth_user_id || ''), item]));

  return (
    <div>
      <PageHeader title="Segurança" subtitle="Sessões, acesso e trilha de ações sensíveis do AdvOS." />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <section className="card p-5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Acesso</p><p className="mt-2 text-xl font-black text-emerald-700">E-mail + senha</p><p className="mt-1 text-xs text-slate-500">Acesso restrito a usuários cadastrados e ativos, com senha forte e sessão controlada.</p></section>
        <section className="card p-5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Inatividade</p><p className="mt-2 text-xl font-black">60 minutos</p><p className="mt-1 text-xs text-slate-500">A interface encerra a sessão em dispositivo abandonado.</p></section>
        <section className="card p-5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Tempo máximo local</p><p className="mt-2 text-xl font-black">12 horas</p><p className="mt-1 text-xs text-slate-500">Configure também os limites autoritativos no Supabase Auth.</p></section>
      </div>

      <section className="card p-5">
        <div className="mb-4"><h2 className="text-lg font-black">Eventos de segurança</h2><p className="text-sm text-slate-500">Últimos 200 registros sensíveis. Senhas, tokens e conteúdo de documentos não são gravados aqui.</p></div>
        {error ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">A tabela de auditoria ainda não está disponível. Rode a migração de segurança da v9.39.</p>
        ) : (
          <div className="table-responsive">
            <table className="table min-w-[880px]">
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
        )}
        {!error && !(events || []).length && <p className="text-sm font-bold text-slate-500">Nenhum evento registrado ainda.</p>}
      </section>
    </div>
  );
}
