import Link from 'next/link';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import SignatureDocumentPreview from './SignatureDocumentPreview';

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
          const isSigned = normalizeStatus(r.status) === 'assinado';
          const clientSigned = normalizeStatus(client?.status) === 'assinado';
          const canSignOffice = tab === 'pendentes' && clientSigned && !!daniel?.id && normalizeStatus(daniel?.status) !== 'assinado';
          return (
            <SignatureDocumentPreview
              key={r.id}
              requestId={r.id}
              title={r.document_title}
              clientName={client?.name || '—'}
              clientStatus={client?.status || null}
              danielStatus={daniel?.status || null}
              signed={isSigned}
              canSignOffice={canSignOffice}
            />
          );
        })}
      </section>
    </div>
  );
}
