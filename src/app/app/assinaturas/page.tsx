import Link from 'next/link';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

type Signer = {
  id: string;
  name: string | null;
  phone: string | null;
  signer_order: number | null;
  signer_token: string | null;
  status: string | null;
  role: string | null;
  signed_at: string | null;
  request_id: string;
};

type RequestRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
  final_document_path: string | null;
  document_title: string;
  signers: Signer[];
};

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export default async function Assinaturas({ searchParams }: { searchParams?: Promise<Query> }) {
  const { profile } = await getCurrentProfile();
  const query = (await searchParams) || {};
  const tab = String(query.tab || 'pendentes') === 'assinadas' ? 'assinadas' : 'pendentes';
  const db = createAdminSupabase();

  // A página não depende de joins relacionais do PostgREST. Isso evita erro
  // 500 caso alguma foreign key/relationship ainda não esteja registrada.
  const reqResult = await db
    .from('signature_requests')
    .select('id,status,created_at,expires_at,final_document_path,document_id')
    .eq('law_firm_id', profile.law_firm_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (reqResult.error) {
    console.error('[AdvOS] Falha ao carregar signature_requests:', reqResult.error);
  }

  const rawRequests = (reqResult.data || []) as Array<{
    id: string;
    status: string | null;
    created_at: string | null;
    expires_at: string | null;
    final_document_path: string | null;
    document_id: string | null;
  }>;

  const documentIds = rawRequests.map((r) => r.document_id).filter(Boolean) as string[];
  const requestIds = rawRequests.map((r) => r.id);

  const [documentsResult, signersResult] = await Promise.all([
    documentIds.length
      ? db.from('documents').select('id,title').in('id', documentIds).eq('law_firm_id', profile.law_firm_id)
      : Promise.resolve({ data: [], error: null } as any),
    requestIds.length
      ? db.from('signature_signers').select('id,request_id,name,phone,signer_order,signer_token,status,role,signed_at').in('request_id', requestIds).eq('law_firm_id', profile.law_firm_id).order('signer_order', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (documentsResult.error) console.error('[AdvOS] Falha ao carregar documentos de assinatura:', documentsResult.error);
  if (signersResult.error) console.error('[AdvOS] Falha ao carregar signatários:', signersResult.error);

  const documentMap = new Map<string, string>();
  for (const doc of (documentsResult.data || []) as Array<{ id: string; title: string | null }>) {
    documentMap.set(doc.id, doc.title || 'Documento');
  }

  const signersByRequest = new Map<string, Signer[]>();
  for (const signer of (signersResult.data || []) as Signer[]) {
    const list = signersByRequest.get(signer.request_id) || [];
    list.push(signer);
    signersByRequest.set(signer.request_id, list);
  }

  const requests: RequestRow[] = rawRequests.map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    expires_at: r.expires_at,
    final_document_path: r.final_document_path,
    document_title: r.document_id ? (documentMap.get(r.document_id) || 'Documento') : 'Documento',
    signers: signersByRequest.get(r.id) || [],
  }));

  const pending = requests.filter((r) => !['assinado', 'cancelada', 'cancelado', 'expirada', 'expired'].includes(normalizeStatus(r.status)));
  const signed = requests.filter((r) => normalizeStatus(r.status) === 'assinado');
  const rows = tab === 'assinadas' ? signed : pending;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1>Assinaturas</h1>
          <p>Gerencie documentos em assinatura e consulte os PDFs concluídos.</p>
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
        ) : rows.map((r) => {
          const client = r.signers.find((s) => Number(s.signer_order) === 1) || r.signers[0];
          const daniel = r.signers.find((s) => Number(s.signer_order) === 2 || s.role === 'advogado');
          const nextPending = r.signers.find((s) => normalizeStatus(s.status) === 'pendente');
          return (
            <div key={r.id} className="card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-slate-950">{r.document_title}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Cliente: {client?.name || '—'} · Criada em {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${normalizeStatus(r.status) === 'assinado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{String(r.status || 'pendente').replaceAll('_',' ')}</span>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className={`rounded-2xl border p-3 ${normalizeStatus(client?.status) === 'assinado' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Cliente</p>
                  <p className="mt-1 text-sm font-black">{client?.name || '—'}</p>
                  <p className="text-xs font-semibold text-slate-600">{normalizeStatus(client?.status) === 'assinado' ? 'Assinado ✓' : 'Aguardando assinatura'}</p>
                </div>
                <div className={`rounded-2xl border p-3 ${normalizeStatus(daniel?.status) === 'assinado' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Daniel Costa Ladeira</p>
                  <p className="mt-1 text-sm font-black">Daniel Costa Ladeira</p>
                  <p className="text-xs font-semibold text-slate-600">{normalizeStatus(daniel?.status) === 'assinado' ? 'Assinado ✓' : 'Aguardando assinatura do escritório'}</p>
                  {tab === 'pendentes' && daniel?.id && normalizeStatus(daniel?.status) !== 'assinado' && (
                    <Link href={`/app/assinaturas/${r.id}/assinar`} className="mt-2 inline-flex rounded-lg bg-[#075e54] px-3 py-2 text-[11px] font-black text-white">Assinar como escritório</Link>
                  )}
                  {tab === 'assinadas' && r.final_document_path && (
                    <div className="mt-3 space-y-3">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <iframe title={`Documento assinado - ${r.document_title}`} src={`/api/signatures/${r.id}/final`} className="h-[58vh] min-h-[430px] md:h-[620px] w-full border-0" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a href={`/api/signatures/${r.id}/final`} target="_blank" rel="noreferrer" className="inline-flex rounded-lg bg-[#075e54] px-3 py-2 text-[11px] font-black text-white">Abrir em nova janela</a>
                        <a href={`/api/signatures/${r.id}/final?download=1`} className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">Baixar PDF assinado</a>
                      </div>
                    </div>
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
