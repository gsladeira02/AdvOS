'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SelectedFile = {
  file: File;
  customName: string;
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

export function ClientFileUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list).filter(Boolean).map((file) => ({ file, customName: '', id: fileId(file) }));
    if (next.length) setFiles((current) => [...current, ...next]);
  }

  function updateName(id: string, customName: string) {
    setFiles((current) => current.map((item) => item.id === id ? { ...item, customName } : item));
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
  }

  async function submit() {
    setError('');
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
      });

      const response = await fetch('/api/client-files/upload', {
        method: 'POST',
        body: form,
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Não foi possível enviar os documentos.');

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
          multiple
          onChange={(event) => event.target.files && addFiles(event.target.files)}
        />
        <p className="text-lg font-black text-[#12213a]">Arraste um ou mais documentos para esta pasta</p>
        <p className="mt-2 text-sm text-slate-500">Também é possível selecionar vários arquivos de uma vez pelo computador.</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => inputRef.current?.click()}>
          Selecionar documentos
        </button>
      </div>

      {files.length > 0 && (
        <div className="rounded-3xl border border-[#eee4d4] bg-[#fbf7ef] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <b>{files.length} documento(s) selecionado(s)</b>
            <button type="button" className="text-sm font-bold text-red-700" onClick={() => setFiles([])}>Limpar seleção</button>
          </div>
          <div className="space-y-3">
            {files.map((item, index) => (
              <div key={item.id} className="grid gap-3 rounded-2xl border border-[#eee4d4] bg-white p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                <div>
                  <p className="font-bold text-[#12213a]">{item.file.name}</p>
                  <p className="text-xs text-slate-500">{humanSize(item.file.size)}</p>
                </div>
                <input
                  className="input"
                  value={item.customName}
                  onChange={(event) => updateName(item.id, event.target.value)}
                  placeholder={`Nome no AdvOS: ${item.file.name}`}
                  aria-label={`Nome do documento ${index + 1}`}
                />
                <button type="button" className="btn btn-secondary" onClick={() => removeFile(item.id)}>Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={sending || !files.length} onClick={submit}>
          {sending ? 'Enviando...' : 'Enviar para a pasta'}
        </button>
        <span className="text-sm text-slate-500">Se o nome não for preenchido, o AdvOS usará o nome original do arquivo.</span>
      </div>
    </div>
  );
}
