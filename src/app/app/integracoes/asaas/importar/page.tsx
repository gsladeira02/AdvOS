export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { dateBR } from '@/lib/utils';
import { ServerTablePagination } from '@/components/ServerTablePagination';
import { parseServerPagination } from '@/lib/pagination';

function qs(v?: string | string[]) {
  const value = Array.isArray(v) ? v[0] : v;
  return decodeURIComponent(value || '').replace(/\+/g, ' ');
}

function importTypeLabel(value?: string) {
  const labels: Record<string, string> = { auto: 'Clientes e cobranças', clients: 'Somente clientes', payments: 'Somente cobranças' };
  return labels[String(value || '')] || value || '-';
}

export default async function ImportarAsaas({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const { page, pageSize, from, to } = parseServerPagination(query);

  const [servicesRes, batchesRes] = await Promise.all([
    admin.from('legal_services').select('id,name,active').eq('law_firm_id', profile.law_firm_id).order('name'),
    admin
      .from('asaas_import_batches')
      .select('id,file_name,import_type,inserted_clients,updated_clients,inserted_payments,updated_payments,skipped_rows,errors,created_at', { count: 'exact' })
      .eq('law_firm_id', profile.law_firm_id)
      .order('created_at', { ascending: false })
      .range(from, to),
  ]);

  return (
    <div>
      <PageHeader
        title="Importação inicial do Asaas"
        subtitle="Importe clientes e cobranças exportados do Asaas para iniciar o histórico financeiro dentro do AdvOS."
      />

      {query?.ok && (
        <section className="card mb-6 border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <b>Importação concluída.</b>{' '}
          Clientes criados: {query.clientes_criados || 0}. Clientes atualizados: {query.clientes_atualizados || 0}. Cobranças criadas: {query.cobrancas_criadas || 0}. Cobranças atualizadas: {query.cobrancas_atualizadas || 0}. Linhas ignoradas: {query.ignoradas || 0}.
        </section>
      )}

      {query?.erro && (
        <section className="card mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>Erro na importação:</b> {qs(query.erro)}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card p-6">
          <h2 className="text-2xl font-black">Enviar arquivo exportado</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use o arquivo exportado do Asaas em formato CSV ou XLSX. O AdvOS tenta identificar automaticamente colunas como cliente, CPF/CNPJ, e-mail, telefone, ID Asaas, valor, vencimento, status e link da cobrança.
          </p>

          <form action="/api/asaas/import" method="post" encType="multipart/form-data" className="mt-6 space-y-5">
            <div>
              <label className="label">Arquivo do Asaas</label>
              <input className="input mt-1" type="file" name="file" accept=".csv,.xlsx,.xls" required />
              <p className="mt-2 text-xs text-slate-500">Prefira exportar clientes e cobranças em XLSX ou CSV. Não envie PDF para importação.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Tipo de importação</label>
                <select className="input mt-1" name="import_type" defaultValue="auto">
                  <option value="auto">Automática: clientes e cobranças</option>
                  <option value="clients">Somente clientes</option>
                  <option value="payments">Somente cobranças</option>
                </select>
              </div>
              <div>
                <label className="label">Serviço padrão para novos clientes</label>
                <select className="input mt-1" name="service_id" defaultValue="">
                  <option value="">Sem serviço padrão</option>
                  {(servicesRes.data || []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}{!s.active ? ' (inativo)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-700">
              <input type="checkbox" name="create_missing_clients" value="true" defaultChecked className="mt-1" />
              <span>
                <b>Criar clientes que ainda não existem no AdvOS.</b><br />
                O sistema cruza ID do Asaas, CPF/CNPJ, e-mail, telefone e nome. Se não encontrar cliente compatível, cria um novo cadastro.
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-700">
              <input type="checkbox" name="update_existing_clients" value="true" defaultChecked className="mt-1" />
              <span>
                <b>Atualizar dados de clientes já encontrados.</b><br />
                Campos vazios no AdvOS podem ser preenchidos com CPF/CNPJ, telefone, WhatsApp, e-mail e ID Asaas do arquivo.
              </span>
            </label>

            <button className="btn btn-primary">Importar Asaas</button>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <h3 className="text-xl font-black">Como exportar</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Entre no painel do Asaas.</li>
              <li>Exporte clientes e/ou cobranças em CSV ou Excel.</li>
              <li>Volte para esta tela e envie o arquivo.</li>
              <li>Confira os clientes e o financeiro importado.</li>
            </ol>
          </section>

          <section className="card p-5">
            <h3 className="text-xl font-black">O que o AdvOS faz</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>• cria clientes faltantes;</p>
              <p>• vincula clientes ao ID do Asaas;</p>
              <p>• cria cobranças no financeiro;</p>
              <p>• evita duplicar cobranças quando encontra ID externo;</p>
              <p>• salva links de pagamento quando existirem no arquivo.</p>
            </div>
          </section>
        </aside>
      </div>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">Últimas importações</h2>
          <Link href="/app/integracoes" className="btn btn-secondary py-2 text-sm">Voltar para Integrações</Link>
        </div>

        <div className="table-responsive mt-4">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Arquivo</th>
                <th>Tipo</th>
                <th>Clientes</th>
                <th>Cobranças</th>
                <th>Ignoradas</th>
                <th>Erros</th>
              </tr>
            </thead>
            <tbody>
              {(batchesRes.data || []).map((b: any) => (
                <tr key={b.id}>
                  <td>{dateBR(String(b.created_at || '').slice(0, 10))}</td>
                  <td><span className="break-safe">{b.file_name || '-'}</span></td>
                  <td>{importTypeLabel(b.import_type)}</td>
                  <td>{Number(b.inserted_clients || 0)} criados / {Number(b.updated_clients || 0)} atualizados</td>
                  <td>{Number(b.inserted_payments || 0)} criadas / {Number(b.updated_payments || 0)} atualizadas</td>
                  <td>{Number(b.skipped_rows || 0)}</td>
                  <td>{Array.isArray(b.errors) && b.errors.length ? `${b.errors.length} ${b.errors.length === 1 ? 'ocorrência' : 'ocorrências'}` : '-'}</td>
                </tr>
              ))}
              {!batchesRes.data?.length && <tr><td colSpan={7} className="text-slate-500">Nenhuma importação registrada.</td></tr>}
            </tbody>
          </table>
        </div>
        <ServerTablePagination basePath="/app/integracoes/asaas/importar" page={page} pageSize={pageSize} totalItems={batchesRes.count || 0} />
      </section>
    </div>
  );
}
