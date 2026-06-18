export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildContractLinksMessage, whatsappUrl } from '@/lib/whatsapp';
import { dateBR, money } from '@/lib/utils';

async function signedUrl(path?: string | null) {
  if (!path) return '';
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from('documents').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || '';
}

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

function linkFromInstallment(i: any) {
  return i?.invoice_url || i?.payment_url || i?.bank_slip_url || '';
}

export default async function PastaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string>> }) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, profile } = await getCurrentProfile();

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!client) notFound();

  const [docsRes, generatedRes, casesRes, profilesRes] = await Promise.all([
    supabase
      .from('documents')
      .select('*, cases(case_number,area,action_type), document_signatures(signature_url,status)')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('generated_contracts')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('cases')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('full_name,email,phone,oab_number')
      .eq('law_firm_id', profile.law_firm_id)
      .order('full_name'),
  ]);

  const generated = generatedRes.data || [];
  const financialIds = generated.map((g: any) => g.financial_contract_id).filter(Boolean);
  const installmentsRes = financialIds.length
    ? await supabase.from('financial_installments').select('*').eq('law_firm_id', profile.law_firm_id).in('contract_id', financialIds).order('due_date')
    : { data: [] as any[] };

  const installmentsByContract = new Map<string, any[]>();
  for (const i of installmentsRes.data || []) {
    if (!installmentsByContract.has(i.contract_id)) installmentsByContract.set(i.contract_id, []);
    installmentsByContract.get(i.contract_id)!.push(i);
  }

  const docs = await Promise.all((docsRes.data || []).map(async (d: any) => ({
    ...d,
    download_url: d.external_url || await signedUrl(d.storage_path),
  })));

  const lawyers = (profilesRes.data || []).filter((p: any) => p.full_name);
  const defaultOutorgados = lawyers
    .map((p: any) => `${p.full_name}${p.oab_number ? `, OAB ${p.oab_number}` : ''}`)
    .join('; ');
  const responsible = lawyers[0] as any;
  const clientPhone = client.whatsapp || client.phone || '';

  return <div>
    <PageHeader title={`Pasta do cliente: ${client.name}`} subtitle="Gere documentos, crie cobranças, envie links pelo WhatsApp e salve arquivos na pasta em nuvem do cliente." />

    {query?.gerado && (
      <section className="card mb-6 border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Documento gerado em PDF. O AdvOS tentou enviar para a ZapSign, criar as cobranças no Asaas e salvar tudo na pasta deste cliente.
      </section>
    )}

    <section className="card mb-6 p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          <h2 className="text-2xl font-black">Dados do cliente</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p><b>Documento:</b> {client.doc || '-'}</p>
            <p><b>Tipo:</b> {client.client_type || '-'}</p>
            <p><b>WhatsApp:</b> {clientPhone || '-'}</p>
            <p><b>E-mail:</b> {client.email || '-'}</p>
            <p className="md:col-span-2"><b>Endereço:</b> {client.address || '-'}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-600">
          <b>Pasta em nuvem</b>
          <p className="mt-2">Esta tela concentra documentos gerados, arquivos enviados manualmente, links de assinatura, cobranças e processos do cliente.</p>
        </div>
      </div>
    </section>

    <section className="card mb-6 p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-black">Gerar documentos e cobrança</h2>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">
          Use esta área dentro da pasta do cliente para gerar contrato, procuração, enviar o PDF para a ZapSign, criar entrada/parcelas no Asaas e depois mandar os links pelo WhatsApp cadastrado.
        </p>
      </div>

      <form action="/api/contracts/generate" method="post" className="space-y-6">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="redirect_to" value={`/app/clientes/${client.id}?gerado=1`} />

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
            <label className="label">Processo vinculado</label>
            <select className="input mt-1" name="case_id">
              <option value="">Opcional</option>
              {(casesRes.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.case_number || c.action_type || c.area}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Forma de cobrança Asaas</label>
            <select className="input mt-1" name="billing_type" defaultValue="BOLETO">
              <option value="BOLETO">Boleto</option>
              <option value="PIX">Pix</option>
              <option value="UNDEFINED">Cliente escolhe</option>
            </select>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-black">Dados do contratante/outorgante</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <input className="input md:col-span-2" name="client_name" defaultValue={client.name || ''} placeholder="Nome do contratante/outorgante" />
            <input className="input" name="nationality" placeholder="Nacionalidade" defaultValue="brasileiro(a)" />
            <input className="input" name="civil_status" placeholder="Estado civil" />
            <input className="input" name="profession" placeholder="Profissão" />
            <input className="input" name="rg" placeholder="RG" />
            <input className="input" name="rg_uf" placeholder="Órgão/UF do RG" />
            <input className="input" name="cpf" defaultValue={client.doc || ''} placeholder="CPF/CNPJ" />
            <input className="input" name="phone" defaultValue={clientPhone || ''} placeholder="WhatsApp/telefone para ZapSign" />
            <input className="input md:col-span-3" name="address" defaultValue={client.address || ''} placeholder="Endereço completo" />
            <input className="input" name="email" defaultValue={client.email || ''} placeholder="E-mail para ZapSign/Asaas" />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-lg font-black">Local, foro, data e objeto</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <input className="input" name="local" placeholder="Local" defaultValue="Vila Velha/ES" />
            <input className="input" name="forum" placeholder="Foro" defaultValue="Vila Velha/ES" />
            <input className="input" name="contract_date" type="date" />
            <input className="input" name="due_day" type="number" min="1" max="31" placeholder="Dia vencimento" />
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
        </div>

        <div>
          <h3 className="mb-3 text-lg font-black">Honorários e cobranças Asaas</h3>
          <div className="grid gap-4 md:grid-cols-6">
            <input className="input" name="total_amount" type="number" step="0.01" placeholder="Valor total" />
            <input className="input" name="entry_amount" type="number" step="0.01" placeholder="Entrada" />
            <input className="input" name="entry_date" type="date" placeholder="Data da entrada" />
            <input className="input" name="installment_count" type="number" placeholder="Nº parcelas" />
            <input className="input" name="installment_amount" type="number" step="0.01" placeholder="Valor parcela" />
            <input className="input md:col-span-6" name="payment_notes" placeholder="Observações do pagamento" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Ao gerar, a entrada e as parcelas serão cadastradas no financeiro e enviadas ao Asaas se a integração estiver configurada.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary">Gerar PDF + ZapSign + Asaas</button>
          <span className="text-sm text-slate-500">O documento e as cobranças aparecerão no histórico desta pasta.</span>
        </div>
      </form>
    </section>

    <section className="card mb-6 p-5">
      <h2 className="text-xl font-black">Enviar arquivo para a pasta</h2>
      <form action="/api/client-files/upload" method="post" encType="multipart/form-data" className="mt-4 grid gap-4 md:grid-cols-4">
        <input type="hidden" name="client_id" value={client.id} />
        <input className="input" name="title" placeholder="Nome do documento" />
        <select className="input" name="doc_type" defaultValue="outros">
          <option value="procuração">procuração</option>
          <option value="contrato de honorários">contrato de honorários</option>
          <option value="documento pessoal">documento pessoal</option>
          <option value="comprovante">comprovante</option>
          <option value="petição">petição</option>
          <option value="decisão">decisão</option>
          <option value="sentença">sentença</option>
          <option value="acordo">acordo</option>
          <option value="recibo">recibo</option>
          <option value="outros">outros</option>
        </select>
        <input className="input" name="file" type="file" required />
        <button className="btn btn-primary">Enviar arquivo</button>
        <input className="input md:col-span-4" name="notes" placeholder="Observações" />
      </form>
    </section>

    <section className="card mb-6 p-5">
      <h2 className="text-xl font-black">Documentos da pasta</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead><tr><th>Documento</th><th>Tipo</th><th>Processo</th><th>Assinatura</th><th>Arquivo</th><th>Criado em</th></tr></thead>
          <tbody>{docs.map((d:any)=><tr key={d.id}>
            <td><b>{d.title}</b><br/><span className="text-xs text-slate-500">{d.notes}</span></td>
            <td>{d.doc_type || '-'}</td>
            <td>{d.cases?.case_number || d.cases?.action_type || '-'}</td>
            <td>{d.document_signatures?.[0]?.signature_url ? <Link className="font-bold text-blue-700" href={d.document_signatures[0].signature_url} target="_blank">ZapSign</Link> : (d.signature_status || '-')}</td>
            <td>{d.download_url ? <Link className="font-bold text-blue-700" href={d.download_url} target="_blank">abrir arquivo</Link> : '-'}</td>
            <td>{dateBR(d.created_at)}</td>
          </tr>)}</tbody>
        </table>
        {!docs.length && <p className="mt-3 text-sm text-slate-500">Nenhum documento salvo para este cliente.</p>}
      </div>
    </section>

    <section className="card mb-6 p-5">
      <h2 className="text-xl font-black">Documentos gerados, cobranças e WhatsApp</h2>
      <div className="mt-4 space-y-4">
        {generated.map((g:any)=>{
          const charges = installmentsByContract.get(g.financial_contract_id) || [];
          const asaasLinks = charges.map((i:any, idx:number)=>({label:`Cobrança ${idx+1}`,amount:i.amount,dueDate:i.due_date,url:linkFromInstallment(i)})).filter((x:any)=>x.url);
          const message = buildContractLinksMessage({clientName:client.name,zapsignUrl:g.zapsign_url,asaasLinks});
          const wa = whatsappUrl(client.whatsapp || client.phone || g.phone, message);
          return <div className="rounded-2xl border border-[#eee4d4] p-4" key={g.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <b>{docLabel(g.document_type)}</b>
                <p className="text-sm text-slate-500">{g.pdf_filename || 'PDF'} · {dateBR(g.created_at)} · {money(g.total_amount || 0)}</p>
              </div>
              {wa ? <Link className="btn btn-primary" href={wa} target="_blank">Enviar links no WhatsApp</Link> : <span className="badge badge-warn">sem WhatsApp cadastrado</span>}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
              <p><b>ZapSign:</b> {g.zapsign_url ? <Link href={g.zapsign_url} target="_blank" className="font-bold text-blue-700">abrir assinatura</Link> : <span className={`badge ${statusClass(g.zapsign_status)}`}>{g.zapsign_status || 'pendente'}</span>}</p>
              <p><b>Asaas:</b> {asaasLinks.length ? `${asaasLinks.length} link(s) de cobrança` : <span className={`badge ${statusClass(g.asaas_status)}`}>{g.asaas_status || 'pendente'}</span>}</p>
              <p><b>Data:</b> {dateBR(g.contract_date)}</p>
            </div>
          </div>
        })}
        {!generated.length && <p className="text-sm text-slate-500">Nenhum documento gerado para este cliente.</p>}
      </div>
    </section>

    <section className="card p-5">
      <h2 className="text-xl font-black">Processos vinculados</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="table"><thead><tr><th>Número</th><th>Área</th><th>Ação</th><th>Status</th></tr></thead><tbody>{(casesRes.data || []).map((c:any)=><tr key={c.id}><td>{c.case_number || '-'}</td><td>{c.area || '-'}</td><td>{c.action_type || '-'}</td><td>{c.status || '-'}</td></tr>)}</tbody></table>
        {!casesRes.data?.length && <p className="mt-3 text-sm text-slate-500">Nenhum processo vinculado.</p>}
      </div>
    </section>
  </div>
}
