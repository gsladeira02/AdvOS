export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { money } from '@/lib/utils';

function statusLabel(value?: string) {
  const labels: Record<string, string> = { ativo: 'Ativo', suspenso: 'Suspenso', arquivado: 'Arquivado', encerrado: 'Encerrado' };
  return labels[String(value || '')] || value || '-';
}

export default async function Processos() {
  const { supabase, profile } = await getCurrentProfile();
  const [cases, clients] = await Promise.all([
    supabase.from('cases').select('*, clients(name)').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }),
    supabase.from('clients').select('id,name').eq('law_firm_id', profile.law_firm_id),
  ]);

  const rows = cases.data || [];

  return (
    <div>
      <PageHeader title="Processos" subtitle="Cadastre e acompanhe processos, fases e responsáveis." />

      <section className="card mb-6 p-5">
        <form action="/api/cases" method="post" className="grid gap-4 md:grid-cols-4">
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <input className="input" name="case_number" placeholder="Nº do processo" />
          <select className="input" name="area" defaultValue="cível">
            <option value="cível">Cível</option>
            <option value="trabalhista">Trabalhista</option>
            <option value="família">Família</option>
            <option value="previdenciário">Previdenciário</option>
            <option value="consumidor">Consumidor</option>
            <option value="criminal">Criminal</option>
            <option value="empresarial">Empresarial</option>
            <option value="tributário">Tributário</option>
            <option value="imobiliário">Imobiliário</option>
          </select>
          <input className="input" name="action_type" placeholder="Tipo de ação" />
          <input className="input" name="court" placeholder="Tribunal ou vara" />
          <input className="input" name="district" placeholder="Comarca" />
          <input className="input" name="opposing_party" placeholder="Parte contrária" />
          <input className="input" name="responsible" placeholder="Responsável" />
          <input className="input" name="phase" placeholder="Fase atual" />
          <select className="input" name="status" defaultValue="ativo">
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="arquivado">Arquivado</option>
            <option value="encerrado">Encerrado</option>
          </select>
          <input className="input" name="claim_value" placeholder="Valor da causa" type="number" step="0.01" />
          <input className="input" name="notes" placeholder="Observações" />
          <button className="btn btn-primary md:col-span-4">Cadastrar processo</button>
        </form>
      </section>

      <div className="table-responsive">
        <table className="table min-w-[720px]">
          <thead><tr><th>Processo</th><th>Cliente</th><th>Área</th><th>Status</th><th>Valor</th></tr></thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.id}>
                <td><b className="break-safe">{c.case_number || 'Sem número'}</b><p className="text-sm text-slate-500">{c.action_type || '-'}</p></td>
                <td>{c.clients?.name || '-'}</td>
                <td>{c.area || '-'}</td>
                <td><span className="badge badge-info">{statusLabel(c.status)}</span></td>
                <td>{money(c.claim_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="mt-4 text-sm font-medium text-slate-500">Nenhum processo cadastrado.</p>}
    </div>
  );
}
