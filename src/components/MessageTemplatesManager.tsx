'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Plus, Save, Search, Trash2 } from 'lucide-react';
import { TablePagination } from '@/components/TablePagination';

export type MessageTemplateRow = {
  id?: string;
  name: string;
  slug?: string;
  shortcut?: string;
  category?: string;
  body: string;
  active?: boolean;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
};

const categories = [
  ['cobranca', 'Cobrança'],
  ['contrato', 'Contrato'],
  ['assinatura', 'Assinatura'],
  ['documentos', 'Documentos'],
  ['atendimento', 'Atendimento'],
  ['lead', 'Lead'],
  ['geral', 'Geral'],
] as const;

const variables = [
  '{{cliente}}',
  '{{primeiro_nome}}',
  '{{usuario}}',
  '{{usuario_nome_completo}}',
  '{{servico}}',
  '{{parcela}}',
  '{{valor}}',
  '{{vencimento}}',
  '{{link_asaas}}',
  '{{link_assinatura}}',
  '{{linha_link_asaas}}',
  '{{escritorio}}',
  '{{telefone_escritorio}}',
];

function emptyTemplate(): MessageTemplateRow {
  return {
    name: '',
    shortcut: '/',
    category: 'cobranca',
    active: true,
    meta_template_language: 'pt_BR',
    body: '',
  };
}

function normalize(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function shortcutHint(value?: string, name?: string) {
  const source = String(value || name || 'modelo')
    .trim()
    .replace(/^\/+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `/${source || 'modelo'}`;
}

export function MessageTemplatesManager({ initialTemplates, onTemplatesChange }: { initialTemplates: MessageTemplateRow[]; onTemplatesChange?: (templates: MessageTemplateRow[]) => void }) {
  const [templates, setTemplates] = useState<MessageTemplateRow[]>(initialTemplates || []);
  const [draft, setDraft] = useState<MessageTemplateRow>(emptyTemplate());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('todos');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const term = normalize(search);
    return (templates || []).filter((template) => {
      const haystack = normalize(`${template.name || ''} ${template.shortcut || ''} ${template.category || ''} ${template.body || ''}`);
      if (category !== 'todos' && template.category !== category) return false;
      if (term && !haystack.includes(term)) return false;
      return true;
    });
  }, [templates, search, category]);

  const paginated = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  function patchTemplate(id: string | undefined, patch: Partial<MessageTemplateRow>) {
    setTemplates((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function save(template: MessageTemplateRow, isDraft = false) {
    const body = {
      intent: 'save',
      id: template.id || '',
      slug: template.slug || '',
      name: template.name,
      shortcut: shortcutHint(template.shortcut, template.name),
      category: template.category || 'geral',
      active: String(template.active !== false),
      meta_template_name: template.meta_template_name || '',
      meta_template_language: template.meta_template_language || 'pt_BR',
      body: template.body,
    };

    if (!body.name.trim() || !body.body.trim()) {
      setFeedback('Preencha o nome e o texto do modelo antes de salvar.');
      return;
    }

    setSavingId(template.id || 'novo');
    setFeedback(null);
    try {
      const response = await fetch('/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível salvar o modelo.');
      const saved = result.template as MessageTemplateRow;
      if (isDraft) {
        setTemplates((current) => {
          const next = [saved, ...current];
          onTemplatesChange?.(next);
          return next;
        });
        setDraft(emptyTemplate());
      } else {
        setTemplates((current) => {
          const next = current.map((item) => (item.id === saved.id ? saved : item));
          onTemplatesChange?.(next);
          return next;
        });
      }
      setFeedback(`Modelo salvo: ${saved.name}.`);
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível salvar o modelo. Tente novamente.');
    } finally {
      setSavingId(null);
    }
  }

  async function remove(template: MessageTemplateRow) {
    if (!template.id) return;
    const ok = window.confirm(`Apagar o modelo "${template.name}"?`);
    if (!ok) return;
    setSavingId(template.id);
    setFeedback(null);
    try {
      const response = await fetch('/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ intent: 'delete', id: template.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível apagar o modelo.');
      setTemplates((current) => {
        const next = current.filter((item) => item.id !== template.id);
        onTemplatesChange?.(next);
        return next;
      });
      setFeedback('Modelo apagado.');
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao apagar modelo.');
    } finally {
      setSavingId(null);
    }
  }

  function copyVariable(value: string) {
    navigator.clipboard?.writeText(value).catch(() => null);
    setFeedback(`Variável copiada: ${value}`);
  }

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-950">Variáveis e atalhos</h2>
            <p className="mt-1 text-xs text-slate-500">Digite o atalho na conversa, como <b>/cobranca</b>, ou apenas <b>/</b> para listar todos os modelos.</p>
          </div>
          {feedback && <div className="inline-flex max-w-xl items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 break-safe"><CheckCircle2 size={14} /> {feedback}</div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <button key={v} type="button" onClick={() => copyVariable(v)} className="inline-flex items-center gap-1 rounded-lg border border-[#e6dccb] bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-[#fffaf2]">
              <Copy size={11} /> {v}
            </button>
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#e6dccb] bg-[#fbf7ef] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-950">Novo modelo</h2>
              <p className="text-xs text-slate-500">Salvamento instantâneo, sem depender de recarregar a página.</p>
            </div>
            <button className="btn btn-primary !px-3 !py-2 text-xs" type="button" onClick={() => save(draft, true)} disabled={savingId === 'novo'}>
              <Plus size={14} /> {savingId === 'novo' ? 'Salvando...' : 'Salvar novo'}
            </button>
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_140px_150px_100px_170px_100px]">
          <input className="input compact-input" value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value, shortcut: d.shortcut && d.shortcut !== '/' ? d.shortcut : shortcutHint('', event.target.value) }))} placeholder="Nome do modelo" />
          <input className="input compact-input" value={draft.shortcut || ''} onChange={(event) => setDraft((d) => ({ ...d, shortcut: event.target.value }))} placeholder="/cobranca" />
          <select className="input compact-input" value={draft.category || 'geral'} onChange={(event) => setDraft((d) => ({ ...d, category: event.target.value }))}>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="input compact-input" value={draft.active === false ? 'false' : 'true'} onChange={(event) => setDraft((d) => ({ ...d, active: event.target.value === 'true' }))}>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <input className="input compact-input" value={draft.meta_template_name || ''} onChange={(event) => setDraft((d) => ({ ...d, meta_template_name: event.target.value }))} placeholder="Template Meta oficial" />
          <input className="input compact-input" value={draft.meta_template_language || 'pt_BR'} onChange={(event) => setDraft((d) => ({ ...d, meta_template_language: event.target.value }))} placeholder="pt_BR" />
          <textarea className="input min-h-[130px] md:col-span-2 xl:col-span-6" value={draft.body} onChange={(event) => setDraft((d) => ({ ...d, body: event.target.value }))} placeholder="Digite a mensagem pronta..." />
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#e6dccb] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-950">Modelos salvos</h2>
              <p className="text-xs text-slate-500">{filtered.length} de {templates.length} {templates.length === 1 ? 'modelo' : 'modelos'}.</p>
            </div>
            <div className="grid w-full gap-2 md:w-auto md:grid-cols-[240px_180px]">
              <div className="field-with-icon">
                <Search size={14} className="field-with-icon__icon text-slate-400" aria-hidden="true" />
                <input className="input compact-input field-with-icon__input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar modelo" aria-label="Buscar modelo" />
              </div>
              <select className="input compact-input" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                <option value="todos">Todas as categorias</option>
                {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="spreadsheet min-w-[1180px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Atalho</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>Template Meta</th>
                <th>Idioma</th>
                <th>Mensagem</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((template) => (
                <tr key={template.id}>
                  <td className="w-[210px]"><input className="sheet-input font-black" value={template.name || ''} onChange={(event) => patchTemplate(template.id, { name: event.target.value })} /></td>
                  <td className="w-[150px]"><input className="sheet-input" value={template.shortcut || ''} onChange={(event) => patchTemplate(template.id, { shortcut: event.target.value })} /></td>
                  <td className="w-[150px]"><select className="sheet-input" value={template.category || 'geral'} onChange={(event) => patchTemplate(template.id, { category: event.target.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td className="w-[110px]"><select className="sheet-input" value={template.active === false ? 'false' : 'true'} onChange={(event) => patchTemplate(template.id, { active: event.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></td>
                  <td className="w-[180px]"><input className="sheet-input" value={template.meta_template_name || ''} onChange={(event) => patchTemplate(template.id, { meta_template_name: event.target.value })} placeholder="cobranca_vencida" /></td>
                  <td className="w-[90px]"><input className="sheet-input" value={template.meta_template_language || 'pt_BR'} onChange={(event) => patchTemplate(template.id, { meta_template_language: event.target.value })} /></td>
                  <td><textarea className="sheet-input min-h-[58px] resize-y leading-relaxed" value={template.body || ''} onChange={(event) => patchTemplate(template.id, { body: event.target.value })} /></td>
                  <td className="w-[132px] text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white hover:bg-slate-700" onClick={() => save(template)} disabled={savingId === template.id} title="Salvar"><Save size={14} /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => remove(template)} disabled={savingId === template.id} title="Apagar"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


        {!!filtered.length && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        )}

        {!filtered.length && <div className="p-5 text-xs font-bold text-slate-500">Nenhum modelo encontrado.</div>}
      </section>
    </div>
  );
}
