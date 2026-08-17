'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, FileText, Sparkles } from 'lucide-react';

type SelectedFile = {
  file: File;
  customName: string;
  convertToPdf: boolean;
  id: string;
};

function fileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
}

function humanSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function extension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function canConvertToPdf(file: File) {
  const ext = extension(file.name);
  return ['jpg', 'jpeg', 'png', 'webp', 'txt', 'csv', 'xls', 'xlsx'].includes(ext)
    || file.type.startsWith('image/')
    || file.type === 'text/plain'
    || file.type === 'text/csv';
}

export function ClientFileUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list).filter(Boolean).map((file) => ({ file, customName: '', convertToPdf: false, id: fileId(file) }));
    if (next.length) {
      setFiles((current) => [...current, ...next]);
      setSuccess('');
    }
  }

  function updateName(id: string, customName: string) {
    setFiles((current) => current.map((item) => item.id === id ? { ...item, customName } : item));
  }

  function updateConvert(id: string, convertToPdf: boolean) {
    setFiles((current) => current.map((item) => item.id === id ? { ...item, convertToPdf } : item));
  }

  function convertAllCompatible() {
    setFiles((current) => current.map((item) => canConvertToPdf(item.file) ? { ...item, convertToPdf: true } : item));
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
  }

  async function submit() {
    setError('');
    setSuccess('');
    if (!files.length) {
      setError('Selecione ou arraste pelo menos um documento.');
      return;
    }

    setSending(true);
    try {
      const form = new FormData();
      form.append('client_id', clientId);
      form.append('ajax', '1');
      files.forEach((item) => {
        form.append('files', item.file);
        form.append('titles', item.customName.trim());
        form.append('convert_to_pdf', item.convertToPdf ? '1' : '0');
      });

      const response = await fetch('/api/client-files/upload', {
        method: 'POST',
        body: form,
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Não foi possível enviar os documentos.');

      const optimized = Number(json?.summary?.optimized || 0);
      const converted = Number(json?.summary?.converted || 0);
      const savedBytes = Number(json?.summary?.savedBytes || 0);
      const details = [
        optimized ? `${optimized} ${optimized === 1 ? 'arquivo otimizado' : 'arquivos otimizados'}` : '',
        converted ? `${converted} ${converted === 1 ? 'convertido para PDF' : 'convertidos para PDF'}` : '',
        savedBytes > 0 ? `${humanSize(savedBytes)} economizados` : '',
      ].filter(Boolean).join(' • ');
      setSuccess(details ? `Documentos salvos. ${details}.` : 'Documentos salvos com otimização automática.');
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
      window.history.replaceState(null, '', `${window.location.pathname}?upload=1`);
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar documentos.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-black leading-relaxed">Compactação automática ativada</p>
            <p className="mt-1 leading-relaxed text-emerald-900/80">O AdvOS otimiza PDFs, imagens e documentos compactáveis antes de armazenar. Se a otimização não reduzir o tamanho com segurança, o original é preservado.</p>
          </div>
        </div>
      </div>

      <div
        className={`rounded-3xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-[#12213a] bg-[#fbf7ef]' : 'border-[#e8dcc9] bg-white'}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp3,.m4a,.mp4,.aac,.ogg,.opus,.wav,.amr"
          multiple
          onChange={(event) => event.target.files && addFiles(event.target.files)}
        />
        <p className="text-lg font-black leading-relaxed text-[#12213a]">Arraste um ou mais documentos para esta pasta</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Também é possível selecionar vários arquivos de uma vez pelo computador.</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => inputRef.current?.click()}>
          Selecionar documentos
        </button>
      </div>

      {files.length > 0 && (
        <div className="rounded-3xl border border-[#eee4d4] bg-[#fbf7ef] p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <b className="leading-relaxed">{files.length} {files.length === 1 ? 'documento selecionado' : 'documentos selecionados'}</b>
            <div className="flex flex-wrap gap-2">
              {files.some((item) => canConvertToPdf(item.file)) && (
                <button type="button" className="btn btn-secondary !px-3 !py-2 text-xs" onClick={convertAllCompatible}>
                  <FileDown size={14} /> Converter compatíveis para PDF
                </button>
              )}
              <button type="button" className="text-sm font-bold leading-relaxed text-red-700" onClick={() => setFiles([])}>Limpar seleção</button>
            </div>
          </div>
          <div className="space-y-3">
            {files.map((item, index) => {
              const convertible = canConvertToPdf(item.file);
              return (
                <div key={item.id} className="grid gap-3 rounded-2xl border border-[#eee4d4] bg-white p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(220px,1fr)_minmax(220px,.75fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <p className="break-safe font-bold leading-relaxed text-[#12213a]" title={item.file.name}>{item.file.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{humanSize(item.file.size)} • compactação automática</p>
                  </div>
                  <input
                    className="input"
                    value={item.customName}
                    onChange={(event) => updateName(item.id, event.target.value)}
                    placeholder={`Nome no AdvOS: ${item.file.name}`}
                    aria-label={`Nome do documento ${index + 1}`}
                  />
                  <div className="min-w-0">
                    {convertible ? (
                      <label className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${item.convertToPdf ? 'border-blue-300 bg-blue-50 text-blue-950' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        <input
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
                          type="checkbox"
                          checked={item.convertToPdf}
                          onChange={(event) => updateConvert(item.id, event.target.checked)}
                        />
                        <span className="min-w-0 leading-relaxed"><b>Converter para PDF</b><span className="block text-xs opacity-75">PDF otimizado antes de salvar</span></span>
                      </label>
                    ) : (
                      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                        <FileText size={15} className="mt-0.5 shrink-0" />
                        <span>Formato original preservado e compactado quando possível.</span>
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => removeFile(item.id)}>Remover</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-relaxed text-red-700">{error}</p>}
      {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold leading-relaxed text-emerald-800">{success}</p>}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button type="button" className="btn btn-primary" disabled={sending || !files.length} onClick={submit}>
          {sending ? 'Otimizando e enviando...' : 'Otimizar e enviar para a pasta'}
        </button>
        <span className="text-sm leading-relaxed text-slate-500">A compactação acontece automaticamente. A conversão para PDF é opcional por arquivo.</span>
      </div>
    </div>
  );
}
