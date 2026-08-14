export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', suspenso: 'Suspenso' };
  return labels[String(value || '')] || value || '-';
}

export default async function Usuarios({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const query = await searchParams;
  const { page, pageSize, from, to } = parseServerPagination(query);
  const { data, count } = await admin.from('profiles').select('*', { count: 'exact' }).eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).range(from, to);
  const users = data || [];
  const totalRows = count || 0;

  return (
    <div>
      <PageHeader title="Usuários" subtitle="Cadastre e consulte as pessoas autorizadas a acessar o AdvOS." />

      <section className="card mb-6 p-5">
        <form action="/api/users" method="post" className="grid gap-4 md:grid-cols-3">
          <input className="input" name="full_name" placeholder="Nome completo" required />
          <input className="input" name="email" type="email" placeholder="E-mail" required />
          <input className="input" name="phone" placeholder="Celular" />
          <input className="input" name="oab_number" placeholder="OAB (opcional)" />
          <div><input className="input" name="password" type="password" autoComplete="new-password" placeholder="Senha provisória forte" required /><p className="mt-1 text-[11px] font-bold text-slate-500">Mín. 14 caracteres, maiúscula, minúscula, número e símbolo.</p></div>
          <button className="btn btn-primary">Criar usuário</button>
        </form>
      </section>

      <div className="table-responsive">
        <table className="table min-w-[680px]">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Celular</th><th>OAB</th><th>Status</th><th>Acesso</th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td><b className="break-safe">{u.full_name || '-'}</b></td>
                <td>{u.email || '-'}</td>
                <td>{u.phone || '-'}</td>
                <td>{u.oab_number || '-'}</td>
                <td><span className={`badge ${u.status === 'ativo' ? 'badge-ok' : 'badge-warn'}`}>{statusLabel(u.status)}</span></td>
                <td>
                  {String(u.auth_user_id || '') === String(profile.auth_user_id || '') ? (
                    <span className="text-xs font-bold text-slate-400">Sua conta</span>
                  ) : (
                    <form action="/api/users" method="post">
                      <input type="hidden" name="action" value="toggle_status" />
                      <input type="hidden" name="profile_id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === 'ativo' ? 'inativo' : 'ativo'} />
                      <button className={`btn ${u.status === 'ativo' ? 'btn-secondary' : 'btn-primary'}`} type="submit">{u.status === 'ativo' ? 'Desativar' : 'Ativar'}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ServerTablePagination basePath="/app/usuarios" page={page} pageSize={pageSize} totalItems={totalRows} />
      {!users.length && <p className="mt-4 text-sm font-medium text-slate-500">Nenhum usuário cadastrado.</p>}
    </div>
  );
}
