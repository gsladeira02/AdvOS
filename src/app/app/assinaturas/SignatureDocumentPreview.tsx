'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

type Props = {
  requestId: string;
  title: string;
  clientName: string;
  clientStatus: string | null;
  danielStatus: string | null;
  signed: boolean;
  canSignOffice: boolean;
};

export default function SignatureDocumentPreview({
  requestId,
  title,
  clientName,
  clientStatus,
  danielStatus,
  signed,
  canSignOffice,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');

  const endpoint = signed ? `/api/signatures/${requestId}/final` : `/api/app/documents/${requestId}/preview`;

  const load = async () => {
    setState('loading');
    setError('');
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl('');
    }
    try {
      const response = await fetch(`${endpoint}?preview=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!response.ok || !contentType.includes('application/pdf')) {
        const text = await response.text().catch(() => '');
        throw new Error(text || 'Não foi possível carregar o documento.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setState('ready');
    } catch (e: any) {
      setState('error');
      setError(e?.message || 'Não foi possível carregar o documento.');
    }
  };

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === 'idle') void load();
  };

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">Cliente: {clientName || '—'}</p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Status</p>
          <p className={`mt-1 text-xs font-black ${signed ? 'text-emerald-700' : 'text-amber-700'}`}>
            {signed ? 'Concluída' : normalizeStatus(clientStatus) === 'assinado' ? 'Aguardando escritório' : 'Aguardando cliente'}
          </p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Visualização do documento</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{signed ? 'Documento final assinado.' : 'Documento da solicitação de assinatura.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {state === 'ready' && blobUrl && (
                <>
                  <a href={blobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">
                    <ExternalLink size={14} /> Abrir
                  </a>
                  <a href={blobUrl} download={`${title.replace(/\.pdf$/i, '')}.pdf`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">
                    <Download size={14} /> Baixar
                  </a>
                </>
              )}
              {state === 'error' && (
                <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              )}
            </div>
          </div>

          {state === 'loading' && (
            <div className="grid min-h-[220px] place-items-center rounded-2xl border border-slate-200 bg-white">
              <div className="text-center">
                <Loader2 className="mx-auto animate-spin text-[#075e54]" size={30} />
                <p className="mt-2 text-xs font-black text-slate-700">Carregando documento...</p>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="grid min-h-[220px] place-items-center rounded-2xl border border-red-100 bg-white p-6 text-center">
              <div>
                <p className="text-sm font-black text-slate-900">Documento indisponível</p>
                <p className="mx-auto mt-1 max-w-lg text-xs font-semibold text-slate-500">{error || 'Não foi possível carregar o PDF para conferência.'}</p>
              </div>
            </div>
          )}

          {state === 'ready' && blobUrl && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <iframe title={`Visualização de ${title}`} src={blobUrl} className="h-[72vh] min-h-[520px] w-full border-0" />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">Cliente: {normalizeStatus(clientStatus) === 'assinado' ? 'Assinado ✓' : 'Pendente'}</span>
            <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">Daniel: {normalizeStatus(danielStatus) === 'assinado' ? 'Assinado ✓' : 'Pendente'}</span>
            {canSignOffice && (
              <a href={`/app/assinaturas/${requestId}/assinar`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#075e54] px-3 py-2 text-[11px] font-black text-white">
                <CheckCircle2 size={14} /> Assinar como escritório
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
