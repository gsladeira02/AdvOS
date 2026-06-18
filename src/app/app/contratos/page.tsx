export const dynamic = 'force-dynamic';

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

export default async function Contratos() {
  const { supabase, profile } = await getCurrentProfile();
  const [clients, cases, profiles, generated] = await Promise.all([
    supabase.from('clients').select('id,name,doc,email,phone,whatsapp,address').eq('law_firm_id', profile.law_firm_id).order('name'),
    supabase.from('cases').select('id,case_number,area,action_type,opposing_party').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('full_name,oab_number').eq('law_firm_id', profile.law_firm_id).order('full_name'),
    supabase.from('generated_contracts').select('id,document_type,client_name,contract_date,total_amount,created_at').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }).limit(12),
  ]);

  const defaultOutorgados = (profiles.data || [])
    .filter((p: any) => p.full_name)
    .map((p: any) => `${p.full_name}${p.oab_number ? `, OAB ${p.oab_number}` : ''}`)
    .join('; ');

  return (
    <div>
      <PageHeader title="Contratos e procurações" subtitle="Gere documentos a partir dos mesmos dados usados na aba Dados Contrato da planilha." />

      <section className="card mb-6 p-6">
        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="text-2xl font-black">Gerador de documentos</h2>
            <p className="mt-2 text-sm text-slate-600">
              Campos espelhados da planilha: nome, estado civil, profissão, RG, CPF, endereço, contato, local, data, honorários, entrada e parcelas.
            </p>
          </div>
          <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-600">
            <b>Modelos disponíveis</b>
            <p className="mt-2">Contrato de honorários, procuração sem hipossuficiência, procuração com declaração de hipossuficiência e kits completos.</p>
          </div>
        </div>

        <form action="/api/contracts/generate" method="post" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Tipo de documento</label>
              <select className="input mt-1" name="document_type" defaultValue="contrato_honorarios">
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
              <input className="input md:col-span-2" name="client_name" placeholder="NomeAutor1" required />
              <input className="input" name="civil_status" placeholder="Estado_Civil_Autor" />
              <input className="input" name="profession" placeholder="Profissao_Autor" />
              <input className="input" name="rg" placeholder="RGAutor1" />
              <input className="input" name="rg_uf" placeholder="UF_RGAutor1" />
              <input className="input" name="cpf" placeholder="CPFAutor1" />
              <input className="input" name="phone" placeholder="TelefoneAutor" />
              <input className="input md:col-span-3" name="address" placeholder="EnderecoAutor1" />
              <input className="input" name="email" placeholder="EmailAutor" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Local, data e objeto</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <input className="input" name="local" placeholder="Local" defaultValue="Vila Velha/ES" />
              <input className="input" name="contract_date" type="date" />
              <input className="input md:col-span-2" name="object" defaultValue="atuação administrativa e/ou judicial relacionada a infrações de trânsito, CNH, suspensão ou cassação do direito de dirigir" placeholder="Objeto do serviço" />
              <textarea className="input md:col-span-4" name="attorneys" rows={3} defaultValue={defaultOutorgados} placeholder="Outorgados/advogados: nome, OAB e qualificação" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-black">Honorários</h3>
            <div className="grid gap-4 md:grid-cols-6">
              <input className="input" name="total_amount" type="number" step="0.01" placeholder="ValorTotalHonorarios" />
              <input className="input" name="entry_amount" type="number" step="0.01" placeholder="ValorEntrada" />
              <input className="input" name="entry_date" type="date" placeholder="DataEntrada" />
              <input className="input" name="installment_count" type="number" placeholder="NumeroParcelas" />
              <input className="input" name="installment_amount" type="number" step="0.01" placeholder="ValorParcelas" />
              <input className="input" name="due_day" type="number" min="1" max="31" placeholder="DiaVencimento" />
              <input className="input md:col-span-6" name="payment_notes" placeholder="Pagos / observações do pagamento" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary">Gerar arquivo Word</button>
            <span className="text-sm text-slate-500">O arquivo será baixado em formato editável .doc e o registro ficará salvo no histórico.</span>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-black">Últimos documentos gerados</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Documento</th><th>Cliente</th><th>Data</th><th>Valor</th><th>Gerado em</th></tr></thead>
            <tbody>
              {(generated.data || []).map((g: any) => (
                <tr key={g.id}>
                  <td><b>{docLabel(g.document_type)}</b></td>
                  <td>{g.client_name}</td>
                  <td>{dateBR(g.contract_date)}</td>
                  <td>{money(g.total_amount || 0)}</td>
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
