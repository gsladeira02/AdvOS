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

function linkFromInstallment(i: any) {
  return i?.invoice_url || i?.payment_url || i?.bank_slip_url || '';
}

export default async function PastaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getCurrentProfile();

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('law_firm_id', profile.law_firm_id)
    .maybeSingle();

  if (!client) notFound();

  const [docsRes, generatedRes, casesRes] = await Promise.all([
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

  return <div>
    <PageHeader title={`Pasta do cliente: ${client.name}`} subtitle="Documentos gerados, arquivos enviados, processos e cobranças do cliente em uma pasta única." />

    <section className="card mb-6 p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          <h2 className="text-2xl font-black">Dados do cliente</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p><b>Documento:</b> {client.doc || '-'}</p>
            <p><b>Tipo:</b> {client.client_type || '-'}</p>
            <p><b>WhatsApp:</b> {client.whatsapp || client.phone || '-'}</p>
            <p><b>E-mail:</b> {client.email || '-'}</p>
            <p className="md:col-span-2"><b>Endereço:</b> {client.address || '-'}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-sm text-slate-600">
          <b>Pasta em nuvem</b>
          <p className="mt-2">Tudo que for gerado em Contratos e todo arquivo enviado manualmente para este cliente aparecerá aqui.</p>
        </div>
      </div>
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
      <h2 className="text-xl font-black">Contratos gerados e envio por WhatsApp</h2>
      <div className="mt-4 space-y-4">
        {generated.map((g:any)=>{
          const charges = installmentsByContract.get(g.financial_contract_id) || [];
          const asaasLinks = charges.map((i:any, idx:number)=>({label:`Cobrança ${idx+1}`,amount:i.amount,dueDate:i.due_date,url:linkFromInstallment(i)})).filter((x:any)=>x.url);
          const message = buildContractLinksMessage({clientName:client.name,zapsignUrl:g.zapsign_url,asaasLinks});
          const wa = whatsappUrl(client.whatsapp || client.phone || g.phone, message);
          return <div className="rounded-2xl border border-[#eee4d4] p-4" key={g.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <b>{g.pdf_filename || g.document_type}</b>
                <p className="text-sm text-slate-500">{dateBR(g.created_at)} · {money(g.total_amount || 0)}</p>
              </div>
              {wa ? <Link className="btn btn-primary" href={wa} target="_blank">Enviar links no WhatsApp</Link> : <span className="badge badge-warn">sem WhatsApp cadastrado</span>}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
              <p><b>ZapSign:</b> {g.zapsign_url ? <Link href={g.zapsign_url} target="_blank" className="font-bold text-blue-700">abrir assinatura</Link> : g.zapsign_status || '-'}</p>
              <p><b>Asaas:</b> {asaasLinks.length ? `${asaasLinks.length} link(s) de cobrança` : g.asaas_status || '-'}</p>
            </div>
          </div>
        })}
        {!generated.length && <p className="text-sm text-slate-500">Nenhum contrato gerado para este cliente.</p>}
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
