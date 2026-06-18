export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { dateBR, money } from '@/lib/utils';

function docLabel(type?: string) {
  if (type === 'procuracao_hipossuficiencia') return 'Procuração com hipossuficiência';
  if (type === 'procuracao_simples') return 'Procuração sem hipossuficiência';
  if (type === 'kit_hipossuficiencia') return 'Kit contrato + procuração com hipossuficiência';
  if (type === 'kit_simples') return 'Kit contrato + procuração sem hipossuficiência';
  return 'Contrato de honorários';
}

function statusClass(status?: string) {
  const s = String(status || '');
  if (s.includes('criada') || s.includes('enviado') || s.includes('assinado')) return 'badge-ok';
  if (s.includes('erro')) return 'badge-danger';
  return 'badge-warn';
}

export default async function Contratos({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const { supabase, profile } = await getCurrentProfile();
  const [clients, cases, profiles, generated] = await Promise.all([
    supabase.from('clients').select('id,name,doc,email,phone,whatsapp,address,asaas_customer_id').eq('law_firm_id', profile.law_firm_id).order('name'),
    supabase.from('cases').select('id,case_number,area,action_type,opposing_party').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('full_name,email,phone,oab_number').eq('law_firm_id', profile.law_firm_id).order('full_name'),
    supabase.from('generated_contracts').select('id,document_type,client_name,contract_date,total_amount,created_at,pdf_filename,pdf_storage_path,zapsign_status,zapsign_url,asaas_status,financial_contract_id').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).limit(12),
  ]);

  const lawyers = (profiles.data || []).filter((p: any) => p.full_name);
  const defaultOutorgados = lawyers
    .map((p: any) => `${p.full_name}${p.oab_number ? `, OAB ${p.oab_number}` : ''}`)
    .join('; ');
  const responsible = lawyers[0] as any;

  return (
    <div>
      <PageHeader title="Contratos e procurações" subtitle="Gere PDFs, envie para assinatura na ZapSign e crie as cobranças no Asaas automaticamente." />

      {params?.gerado && (
        <section className="card mb-6 border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Documento gerado em PDF. O AdvOS tentou enviar para a ZapSign e criar as cobranças no Asaas usando as integrações configuradas.
        </section>
      )}

      <section className="card mb-6 p-6">
        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-2xl font-black">Gerador automático</h2>
            <p className="mt-2 text-sm text-slate-600">
              Preencha os dados uma vez. O AdvOS gera o PDF, envia o documento para assinatura digital e transforma entrada/parcelas em cobranças no Asaas.
            </p>
          </div>
          <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-600">
            <b>Fluxo automático</b>
            <p className="mt-2">1. PDF gerado no padrão do escritório. 2. Envio para ZapSign. 3. Entrada e parcelas criadas no financeiro. 4. Cobranças integradas com Asaas.</p>
          </div>
        </div>

        <form action="/api/contracts/generate" method="post" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Tipo de documento</label>
              <select className="input mt-1" name="document_type" defaultValue="kit_hipossuficiencia">
                <option value="contrato_honorarios">Contrato de honorários</option>
                <option value="procuracao_simples">Procuração sem hipossuficiência</option>
                <option value="procuracao_hipossuficiencia">Procuração com hipossuficiência econômica</option>
                <option value="kit_simples">Kit: contrato + procuração sem hipossuficiência</option>
                <option value="kit_hipossuficiencia">Kit: contrato + procuração com hipossuficiência</option>
              </select>
            </div>
            <div>
              <label className="label">Cliente cadastrado</label>
              <select className="input mt-1" name="client_id">
                <option value="">Opcional</option>
                {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Processo vinculado</label>
              <select className="input mt-1" name="case_id">
                <option value="">Opcional</option>
                {(cases.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.case_number || c.action_type || c.area}</option>)}
              </select>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Dados do autor/contratante</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <input className="input md:col-span-2" name="client_name" placeholder="Nome do contratante/outorgante" required />
              <input className="input" name="nationality" placeholder="Nacionalidade" defaultValue="brasileiro(a)" />
              <input className="input" name="civil_status" placeholder="Estado civil" />
              <input className="input" name="profession" placeholder="Profissão" />
              <input className="input" name="rg" placeholder="RG" />
              <input className="input" name="rg_uf" placeholder="Órgão/UF do RG" />
              <input className="input" name="cpf" placeholder="CPF" />
              <input className="input" name="phone" placeholder="WhatsApp/telefone para ZapSign" />
              <input className="input md:col-span-3" name="address" placeholder="Endereço completo" />
              <input className="input" name="email" placeholder="E-mail para ZapSign/Asaas" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Local, foro, data e objeto</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <input className="input" name="local" placeholder="Local" defaultValue="Vila Velha/ES" />
              <input className="input" name="forum" placeholder="Foro" defaultValue="Vila Velha/ES" />
              <input className="input" name="contract_date" type="date" />
              <select className="input" name="billing_type" defaultValue="BOLETO">
                <option value="BOLETO">Asaas: boleto</option>
                <option value="PIX">Asaas: Pix</option>
                <option value="UNDEFINED">Asaas: cliente escolhe</option>
              </select>
              <input className="input md:col-span-4" name="object" defaultValue="propositura de ação judicial e/ou atuação administrativa relacionada a infrações de trânsito, CNH, suspensão ou cassação do direito de dirigir" placeholder="Objeto do serviço" />
              <textarea className="input md:col-span-4" name="attorneys" rows={3} defaultValue={defaultOutorgados} placeholder="Outorgados/contratados: nome, OAB e qualificação" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Assinantes ZapSign</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <input className="input" name="responsible_signer_name" defaultValue={responsible?.full_name || ''} placeholder="Nome do responsável do escritório" />
              <input className="input" name="responsible_signer_email" defaultValue={responsible?.email || ''} placeholder="E-mail do responsável" />
              <input className="input" name="responsible_signer_phone" defaultValue={responsible?.phone || ''} placeholder="WhatsApp do responsável" />
            </div>
            <p className="mt-2 text-xs text-slate-500">O contratante/outorgante usa o e-mail e telefone informados nos dados do autor.</p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Honorários e cobranças Asaas</h3>
            <div className="grid gap-4 md:grid-cols-6">
              <input className="input" name="total_amount" type="number" step="0.01" placeholder="Valor total" />
              <input className="input" name="entry_amount" type="number" step="0.01" placeholder="Entrada" />
              <input className="input" name="entry_date" type="date" placeholder="Data da entrada" />
              <input className="input" name="installment_count" type="number" placeholder="Nº parcelas" />
              <input className="input" name="installment_amount" type="number" step="0.01" placeholder="Valor parcela" />
              <input className="input" name="due_day" type="number" min="1" max="31" placeholder="Dia vencimento" />
              <input className="input md:col-span-6" name="payment_notes" placeholder="Observações do pagamento" />
            </div>
            <p className="mt-2 text-xs text-slate-500">Ao salvar, a entrada e as parcelas serão cadastradas no financeiro e enviadas para o Asaas se a integração estiver configurada.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary">Gerar PDF + ZapSign + Asaas</button>
            <span className="text-sm text-slate-500">O histórico exibirá o status de cada integração.</span>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-black">Últimos documentos gerados</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Documento</th><th>Cliente</th><th>Valor</th><th>ZapSign</th><th>Asaas</th><th>Links</th><th>Gerado em</th></tr></thead>
            <tbody>
              {(generated.data || []).map((g: any) => (
                <tr key={g.id}>
                  <td><b>{docLabel(g.document_type)}</b><br/><span className="text-xs text-slate-500">{g.pdf_filename || 'PDF'}</span></td>
                  <td>{g.client_name}<br/><span className="text-xs text-slate-500">{dateBR(g.contract_date)}</span></td>
                  <td>{money(g.total_amount || 0)}</td>
                  <td><span className={`badge ${statusClass(g.zapsign_status)}`}>{g.zapsign_status || 'pendente'}</span></td>
                  <td><span className={`badge ${statusClass(g.asaas_status)}`}>{g.asaas_status || 'pendente'}</span></td>
                  <td>
                    <div className="flex flex-col gap-1 text-sm">
                      {g.zapsign_url ? <Link className="font-bold text-blue-700" href={g.zapsign_url} target="_blank">abrir assinatura</Link> : <span className="text-slate-400">sem link ZapSign</span>}
                      {g.financial_contract_id ? <Link className="font-bold text-blue-700" href="/app/financeiro">ver cobranças</Link> : <span className="text-slate-400">sem cobrança</span>}
                    </div>
                  </td>
                  <td>{dateBR(g.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!generated.data?.length && <p className="mt-3 text-sm text-slate-500">Nenhum contrato ou procuração gerado ainda.</p>}
        </div>
      </section>
    </div>
  );
}
