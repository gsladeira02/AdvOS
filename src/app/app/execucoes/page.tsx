export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ExecutionsBuilder } from '@/components/ExecutionsBuilder';
import { missingExecutionFields, isOverdueCollectible, isOutstandingCollectible, todayInBrazil, type ExecutionClient, type ExecutionInstallment } from '@/lib/executionShared';

export default async function ExecucoesPage() {
  const { profile } = await getCurrentProfile();
  const db = createAdminSupabase();
  const lawFirm = profile.law_firm_id;
  const [c, f, p] = await Promise.all([
    db.from('clients').select('id,name,naturalidade,civil_status,profession,rg,rg_uf,doc,address,contract_signed_on,contract_total_amount,contract_installment_count').eq('law_firm_id', lawFirm).order('name'),
    db.from('financial_contracts').select('id,client_id,description').eq('law_firm_id', lawFirm),
    db.from('financial_installments').select('id,contract_id,amount,due_date,status,paid_at').eq('law_firm_id', lawFirm),
  ]);

  if (c.error || f.error || p.error) {
    return <div>
      <PageHeader title="Execuções Judiciais" subtitle="Geração em lote de DOCX e PDF a partir de contratos e parcelas vencidas." />
      <section className="card p-5 text-red-700">Não foi possível carregar os dados financeiros. Nenhum documento foi gerado.</section>
    </div>;
  }
  const today = todayInBrazil();
  const contractMap = new Map((f.data || []).map(x => [String(x.id), { clientId: String(x.client_id || ''), description: x.description || 'Parcela contratual' }]));
  const outstanding: ExecutionInstallment[] = (p.data || []).map(item => {
    const contract = contractMap.get(String(item.contract_id));
    return {
      id: String(item.id), contract_id: String(item.contract_id), client_id: contract?.clientId || '',
      description: contract?.description || '', amount: Number(item.amount),
      due_date: item.due_date, status: item.status, paid_at: item.paid_at,
    };
  }).filter(row => row.client_id && isOutstandingCollectible(row,today));
  const byClient = new Map<string, ExecutionInstallment[]>();
  outstanding.forEach(item => byClient.set(item.client_id, [...(byClient.get(item.client_id) || []), item]));
  const allClients = (c.data || []) as ExecutionClient[];
  const eligible = allClients.filter(client => missingExecutionFields(client).length === 0 && (byClient.get(client.id) || []).filter(row => isOverdueCollectible(row,today)).length >= 2);
  const eligibleIds = new Set(eligible.map(x => x.id));

  return <div>
    <PageHeader title="Execuções Judiciais" subtitle="Selecione vários clientes com ao menos duas parcelas vencidas para cobrar todo o saldo em aberto em um único ZIP (DOCX e PDF)." />
    <ExecutionsBuilder
      clients={eligible}
      installments={outstanding.filter(row => eligibleIds.has(row.client_id))}
      today={today}
      incompleteCount={allClients.filter(client => missingExecutionFields(client).length > 0).length}
      withoutOverdueCount={allClients.filter(client => missingExecutionFields(client).length === 0 && (byClient.get(client.id)||[]).filter(row => isOverdueCollectible(row,today)).length < 2).length}
    />
  </div>;
}
