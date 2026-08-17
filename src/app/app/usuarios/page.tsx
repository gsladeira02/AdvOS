export const dynamic = 'force-dynamic';

import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResponsiveFormSection } from '@/components/ResponsiveFormSection';
import { getCurrentAdminProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', suspenso: 'Suspenso' };
  return labels[String(value || '')] || value || '-';
}

function roleLabel(value?: string) {
  return isAdminRole(value) ? 'Administrador' : 'Membro';
}

export default async function Usuarios({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const query = await searchParams;
  const { page, pageSize, from, to } = parseServerPagination(query);
  const { data, count } = await admin.from('profiles')
    .select('*', { count: 'exact' })
    .eq('law_firm_id', profile.law_firm_id)
    .order('created_at', { ascending: false })
    .range(from, to);
  const users = data || [];
  const totalRows = count || 0;

  const form = (
    <form action="/api/users" method="post" className="compact-form-grid grid gap-2.5 md:grid-cols-3">
      <input className="input compact-input" name="full_name" placeholder="Nome completo" required />
      <input className="input compact-input" name="email" type="email" placeholder="E-mail" required />
      <input className="input compact-input" name="phone" placeholder="Celular" />
      <input className="input compact-input" name="oab_number" placeholder="OAB (opcional)" />
      <div>
        <input
          className="input compact-input"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Senha provisória"
          minLength={6}
          pattern="[A-Za-z0-9]{6,}"
          title="Use no mínimo 6 caracteres, somente letras e números."
          required
        />
        <p className="mt-1 text-[9px] font-bold leading-relaxed text-slate-500">
          Mín. 6 caracteres. Somente letras e números; pode ser só letras, só números ou combinação.
        </p>
      </div>
      <select className="input compact-input" name="role" defaultValue="membro" aria-label="Perfil de acesso">
        <option value="membro">Membro</option>
        <option value="administrador">Administrador</option>
      </select>
      <button className="btn btn-primary md:col-span-3 md:justify-self-start">Criar usuário</button>
    </form>
  );

  return (
    <div>
      <PageHeader title="Usuários" subtitle="Pessoas autorizadas a acessar o AdvOS e seus níveis de permissão." />
      <ResponsiveFormSection title="Novo usuário" description="Cadastre o acesso e defina se o usuário será membro ou administrador.">
        {form}
      </ResponsiveFormSection>

      <div className="hidden md:block table-responsive">
        <table className="table professional-table min-w-[900px]">
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Celular</th><th>OAB</th><th>Perfil</th><th>Status</th><th>Acesso</th></tr>
          </thead>
          <tbody>
            {users.map((u: any) => {
              const isSelf = String(u.auth_user_id || '') === String(profile.auth_user_id || '');
              const targetAdmin = isAdminRole(u.role);
              return (
                <tr key={u.id}>
                  <td><b>{u.full_name || '-'}</b></td>
                  <td><span className="table-ellipsis max-w-[240px]">{u.email || '-'}</span></td>
                  <td>{u.phone || '-'}</td>
                  <td>{u.oab_number || '-'}</td>
                  <td><span className={`badge ${targetAdmin ? 'badge-ok' : ''}`}>{roleLabel(u.role)}</span></td>
                  <td><span className={`badge ${u.status === 'ativo' ? 'badge-ok' : 'badge-warn'}`}>{statusLabel(u.status)}</span></td>
                  <td>
                    {isSelf ? (
                      <span className="text-[10px] font-bold text-slate-400">Sua conta</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <form action="/api/users" method="post">
                          <input type="hidden" name="action" value="set_role" />
                          <input type="hidden" name="profile_id" value={u.id} />
                          <input type="hidden" name="role" value={targetAdmin ? 'membro' : 'administrador'} />
                          <button className="compact-action-button" type="submit">
                            {targetAdmin ? 'Tornar membro' : 'Tornar administrador'}
                          </button>
                        </form>
                        <form action="/api/users" method="post">
                          <input type="hidden" name="action" value="toggle_status" />
                          <input type="hidden" name="profile_id" value={u.id} />
                          <input type="hidden" name="status" value={u.status === 'ativo' ? 'inativo' : 'ativo'} />
                          <button className="compact-action-button" type="submit">{u.status === 'ativo' ? 'Desativar' : 'Ativar'}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-record-list md:hidden">
        {users.map((u: any) => {
          const isSelf = String(u.auth_user_id || '') === String(profile.auth_user_id || '');
          const targetAdmin = isAdminRole(u.role);
          return (
            <details className="mobile-record" key={u.id}>
              <summary>
                <div className="mobile-record-main">
                  <strong>{u.full_name || '-'}</strong>
                  <span>{u.email || '-'}</span>
                </div>
                <div className="mobile-record-side">
                  <span className={`mobile-status-dot ${u.status === 'ativo' ? 'is-paid' : 'is-waiting'}`}>{statusLabel(u.status)}</span>
                  <ChevronDown size={15} className="disclosure-chevron" />
                </div>
              </summary>
              <div className="mobile-record-details">
                <div className="mobile-detail-grid">
                  <div><span>Celular</span><b>{u.phone || '-'}</b></div>
                  <div><span>OAB</span><b>{u.oab_number || '-'}</b></div>
                  <div><span>Perfil</span><b>{roleLabel(u.role)}</b></div>
                  <div><span>Status</span><b>{statusLabel(u.status)}</b></div>
                </div>
                {isSelf ? (
                  <p className="mt-3 text-center text-[10px] font-bold text-slate-400">Sua conta de administrador</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <form action="/api/users" method="post">
                      <input type="hidden" name="action" value="set_role" />
                      <input type="hidden" name="profile_id" value={u.id} />
                      <input type="hidden" name="role" value={targetAdmin ? 'membro' : 'administrador'} />
                      <button className="btn btn-secondary w-full" type="submit">
                        {targetAdmin ? 'Tornar membro' : 'Tornar administrador'}
                      </button>
                    </form>
                    <form action="/api/users" method="post">
                      <input type="hidden" name="action" value="toggle_status" />
                      <input type="hidden" name="profile_id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === 'ativo' ? 'inativo' : 'ativo'} />
                      <button className="btn btn-secondary w-full" type="submit">{u.status === 'ativo' ? 'Desativar acesso' : 'Ativar acesso'}</button>
                    </form>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <ServerTablePagination basePath="/app/usuarios" page={page} pageSize={pageSize} totalItems={totalRows} />
      {!users.length && <p className="empty-state">Nenhum usuário cadastrado.</p>}
    </div>
  );
}
