export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', suspenso: 'Suspenso' };
  return labels[String(value || '')] || value || '-';
}

export default async function Usuarios() {
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const { data } = await admin.from('profiles').select('*').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false });
  const users = data || [];

  return (
    <div>
      <PageHeader title="Usuários" subtitle="Cadastre e consulte as pessoas autorizadas a acessar o AdvOS." />

      <section className="card mb-6 p-5">
        <form action="/api/users" method="post" className="grid gap-4 md:grid-cols-3">
          <input className="input" name="full_name" placeholder="Nome completo" required />
          <input className="input" name="email" type="email" placeholder="E-mail" required />
          <input className="input" name="phone" placeholder="Celular" />
          <input className="input" name="oab_number" placeholder="OAB (opcional)" />
          <input className="input" name="password" type="password" placeholder="Senha provisória" required />
          <button className="btn btn-primary">Criar usuário</button>
        </form>
      </section>

      <div className="table-responsive">
        <table className="table min-w-[680px]">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Celular</th><th>OAB</th><th>Status</th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td><b className="break-safe">{u.full_name || '-'}</b></td>
                <td>{u.email || '-'}</td>
                <td>{u.phone || '-'}</td>
                <td>{u.oab_number || '-'}</td>
                <td><span className={`badge ${u.status === 'ativo' ? 'badge-ok' : 'badge-warn'}`}>{statusLabel(u.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users.length && <p className="mt-4 text-sm font-medium text-slate-500">Nenhum usuário cadastrado.</p>}
    </div>
  );
}
