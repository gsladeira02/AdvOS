import Link from 'next/link';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function Assinaturas({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getCurrentProfile();
  const query = await searchParams;
  const tab = String(query?.tab || 'pendentes') === 'assinadas' ? 'assinadas' : 'pendentes';
  const db = createAdminSupabase();
  const { data: reqs = [] } = await db
    .from('signature_requests')
    .select('id,status,created_at,expires_at,final_document_path,documents(id,title),signature_signers(id,name,phone,signer_order,signer_token,status,role,signed_at)')
    .eq('law_firm_id', profile.law_firm_id)
    .order('created_at', { ascending: false })
    .limit(100);

  const pending = (reqs as any[]).filter((r) => !['assinado', 'cancelada', 'cancelado', 'expirada', 'expired'].includes(String(r.status || '').toLowerCase()));
  const signed = (reqs as any[]).filter((r) => String(r.status || '').toLowerCase() === 'assinado');
  const rows = tab === 'assinadas' ? signed : pending;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1>Assinaturas</h1>
          <p>Controle documentos pendentes, assinaturas do cliente e assinatura do escritório.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/app/assinaturas?tab=pendentes" className={`card p-4 ${tab === 'pendentes' ? 'ring-2 ring-emerald-500' : ''}`}>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Pendentes</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{pending.length}</p>
        </Link>
        <Link href="/app/assinaturas?tab=assinadas" className={`card p-4 ${tab === 'assinadas' ? 'ring-2 ring-emerald-500' : ''}`}>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Assinadas</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{signed.length}</p>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        <Link href="/app/assinaturas?tab=pendentes" className={`rounded-xl px-3 py-2 text-xs font-black whitespace-nowrap ${tab === 'pendentes' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Assinaturas pendentes</Link>
        <Link href="/app/assinaturas?tab=assinadas" className={`rounded-xl px-3 py-2 text-xs font-black whitespace-nowrap ${tab === 'assinadas' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Assinaturas concluídas</Link>
      </div>

      <section className="space-y-3">
        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm font-semibold text-slate-500">Nenhuma assinatura nesta categoria.</div>
        ) : rows.map((r: any) => {
          const client = (r.signature_signers || []).find((s: any) => Number(s.signer_order) === 1) || r.signature_signers?.[0];
          const daniel = (r.signature_signers || []).find((s: any) => Number(s.signer_order) === 2 || s.role === 'advogado');
          const nextPending = (r.signature_signers || []).find((s: any) => String(s.status || '').toLowerCase() === 'pendente');
          return (
            <div key={r.id} className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-slate-950">{r.documents?.title || 'Documento'}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Cliente: {client?.name || '—'} · Criada em {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${String(r.status).toLowerCase() === 'assinado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{String(r.status || 'pendente').replaceAll('_',' ')}</span>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className={`rounded-2xl border p-3 ${client?.status === 'assinado' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Cliente</p>
                  <p className="mt-1 text-sm font-black">{client?.name || '—'}</p>
                  <p className="text-xs font-semibold text-slate-600">{client?.status === 'assinado' ? 'Assinado ✓' : 'Aguardando assinatura'}</p>
                </div>
                <div className={`rounded-2xl border p-3 ${daniel?.status === 'assinado' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Daniel Costa Ladeira</p>
                  <p className="mt-1 text-sm font-black">Daniel Costa Ladeira</p>
                  <p className="text-xs font-semibold text-slate-600">{daniel?.status === 'assinado' ? 'Assinado ✓' : 'Aguardando assinatura do escritório'}</p>
                  {tab === 'pendentes' && nextPending?.signer_token && daniel?.status !== 'assinado' && (
                    <Link href={`/assinar/${daniel.signer_token}`} className="mt-2 inline-flex rounded-lg bg-[#075e54] px-3 py-2 text-[11px] font-black text-white">Assinar como escritório</Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
