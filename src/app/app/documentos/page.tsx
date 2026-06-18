export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import Link from 'next/link';

function signatureBadge(status?: string) {
  if (!status) return 'badge-info';
  if (['assinado', 'doc_signed', 'signed'].includes(status)) return 'badge-ok';
  if (['erro', 'recusado', 'doc_refused'].includes(status)) return 'badge-danger';
  if (['enviado', 'sent', 'preparado'].includes(status)) return 'badge-info';
  return 'badge-warn';
}

export default async function Documentos() {
  const { supabase, profile } = await getCurrentProfile();
  const [docs, clients, cases, signatures] = await Promise.all([
    supabase
      .from('documents')
      .select('*, clients(name,email,phone,whatsapp), cases(case_number)')
      .eq('law_firm_id', profile.law_firm_id)
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id,name,email,phone,whatsapp').eq('law_firm_id', profile.law_firm_id),
    supabase.from('cases').select('id,case_number').eq('law_firm_id', profile.law_firm_id),
    supabase.from('document_signatures').select('*').eq('law_firm_id', profile.law_firm_id).order('created_at', { ascending: false }),
  ]);

  const signatureByDocument = new Map<string, any>();
  for (const s of signatures.data || []) {
    if (!signatureByDocument.has(s.document_id)) signatureByDocument.set(s.document_id, s);
  }

  return (
    <div>
      <PageHeader title="Documentos" subtitle="Organização por cliente/processo e envio opcional para ZapSign." />

      <section className="card mb-6 p-5">
        <form action="/api/documents" method="post" className="grid gap-4 md:grid-cols-4">
          <input className="input" name="title" placeholder="Título" required />
          <select className="input" name="doc_type">
            <option>procuração</option>
            <option>contrato de honorários</option>
            <option>documento pessoal</option>
            <option>comprovante</option>
            <option>petição</option>
            <option>decisão</option>
            <option>sentença</option>
            <option>acordo</option>
            <option>recibo</option>
            <option>outros</option>
          </select>
          <select className="input" name="client_id">
            <option value="">Cliente</option>
            {(clients.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          <select className="input" name="case_id">
            <option value="">Processo</option>
            {(cases.data || []).map((c: any) => <option value={c.id} key={c.id}>{c.case_number}</option>)}
          </select>
          <input className="input md:col-span-2" name="external_url" placeholder="Link público do PDF para ZapSign" />
          <input className="input md:col-span-2" name="notes" placeholder="Observações" />
          <button className="btn btn-primary md:col-span-4">Cadastrar documento</button>
        </form>
      </section>

      <div className="space-y-4">
        {(docs.data || []).map((d: any) => {
          const sig = signatureByDocument.get(d.id);
          return (
            <section className="card p-5" key={d.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black">{d.title}</h2>
                    <span className="badge badge-info">{d.doc_type || 'documento'}</span>
                    <span className={`badge ${signatureBadge(sig?.status)}`}>{sig?.status || 'sem assinatura'}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <p><b>Cliente:</b> {d.clients?.name || '-'}</p>
                    <p><b>Processo:</b> {d.cases?.case_number || '-'}</p>
                    <p><b>PDF:</b> {d.external_url ? <Link href={d.external_url} target="_blank" className="font-bold text-blue-700">abrir link</Link> : 'não informado'}</p>
                    <p><b>Assinatura:</b> {sig?.signature_url ? <Link href={sig.signature_url} target="_blank" className="font-bold text-blue-700">abrir link</Link> : '-'}</p>
                  </div>
                  {d.notes && <p className="mt-3 text-sm text-slate-500">{d.notes}</p>}
                </div>

                <form action="/api/zapsign/send" method="post" className="rounded-2xl border border-[#eee4d4] p-4">
                  <input type="hidden" name="document_id" value={d.id} />
                  <h3 className="font-black">Enviar ZapSign</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input className="input" name="signer_name" placeholder="Nome do signatário" defaultValue={d.clients?.name || ''} required />
                    <input className="input" name="signer_email" type="email" placeholder="E-mail" defaultValue={d.clients?.email || ''} />
                    <input className="input md:col-span-2" name="signer_phone" placeholder="WhatsApp/celular" defaultValue={d.clients?.whatsapp || d.clients?.phone || ''} />
                  </div>
                  <button className="btn btn-primary mt-3 w-full" disabled={!d.external_url}>Enviar para assinatura</button>
                  {!d.external_url && <p className="mt-2 text-xs font-bold text-amber-700">Informe um link público de PDF para enviar.</p>}
                </form>
              </div>
            </section>
          );
        })}
        {!docs.data?.length && <section className="card p-6 text-slate-500">Nenhum documento cadastrado.</section>}
      </div>
    </div>
  );
}
