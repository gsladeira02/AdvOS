'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Settings2, Tag, Trash2, Users } from 'lucide-react';
import { MessageTemplatesManager, type MessageTemplateRow } from '@/components/MessageTemplatesManager';

const COLORS = [
  ['slate', 'Cinza'], ['sky', 'Azul'], ['emerald', 'Verde'], ['violet', 'Violeta'], ['amber', 'Amarelo'], ['rose', 'Rosa'], ['red', 'Vermelho'], ['green', 'Verde forte'], ['indigo', 'Índigo'],
] as const;

const colorClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700', sky: 'bg-sky-100 text-sky-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-700', red: 'bg-red-100 text-red-700', green: 'bg-green-100 text-green-700', indigo: 'bg-indigo-100 text-indigo-700',
};

function colorClass(value?: string) { return colorClasses[String(value || '')] || colorClasses.slate; }

export function WhatsappSettingsCenter({
  tags,
  stages,
  preferences,
  templates,
  onSettingsChanged,
  onTemplatesChanged,
  initialSection = 'tags',
}: {
  tags: any[];
  stages: any[];
  preferences: any;
  templates: MessageTemplateRow[];
  onSettingsChanged?: (next: { tags: any[]; stages: any[]; preferences: any }) => void;
  onTemplatesChanged?: (next: MessageTemplateRow[]) => void;
  initialSection?: string;
}) {
  const [section, setSection] = useState(initialSection === 'modelos' ? 'modelos' : initialSection === 'leads' ? 'leads' : initialSection === 'geral' ? 'geral' : 'tags');
  const [localTags, setLocalTags] = useState<any[]>(tags || []);
  const [localStages, setLocalStages] = useState<any[]>(stages || []);
  const [prefs, setPrefs] = useState<any>(preferences || {});
  const [tagDraft, setTagDraft] = useState({ name: '', color: 'slate' });
  const [stageDraft, setStageDraft] = useState({ name: '', color: 'sky', outcome: 'open' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const openStages = useMemo(() => localStages.filter((stage: any) => stage.active !== false && stage.outcome === 'open'), [localStages]);

  async function api(payload: any) {
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível salvar.');
      setLocalTags(result.tags || []);
      setLocalStages(result.stages || []);
      setPrefs(result.preferences || {});
      onSettingsChanged?.({ tags: result.tags || [], stages: result.stages || [], preferences: result.preferences || {} });
      return result;
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível salvar.');
      return null;
    } finally { setBusy(false); }
  }

  async function saveTag(tag: any, isNew = false) {
    const result = await api({ action: 'save_tag', id: tag.id || '', name: tag.name, color: tag.color, active: tag.active !== false, sortOrder: tag.sort_order || 0 });
    if (result) { if (isNew) setTagDraft({ name: '', color: 'slate' }); setFeedback(isNew ? 'Tag cadastrada.' : 'Tag atualizada.'); }
  }

  async function saveStage(stage: any, isNew = false) {
    const result = await api({ action: 'save_stage', id: stage.id || '', stageKey: stage.stage_key || '', name: stage.name, color: stage.color, active: stage.active !== false, sortOrder: stage.sort_order || 0, outcome: stage.outcome || 'open' });
    if (result) { if (isNew) setStageDraft({ name: '', color: 'sky', outcome: 'open' }); setFeedback(isNew ? 'Etapa cadastrada.' : 'Etapa atualizada.'); }
  }

  async function moveStage(index: number, direction: -1 | 1) {
    const next = [...localStages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const normalized = next.map((stage, idx) => ({ ...stage, sort_order: (idx + 1) * 10 }));
    setLocalStages(normalized);
    const result = await api({ action: 'save_stage_order', stageIds: normalized.map((stage: any) => stage.id) });
    if (result) setFeedback('Ordem do funil atualizada.');
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-950">Configurações do WhatsApp</h2>
        <p className="text-xs font-semibold text-slate-500">Cadastre uma vez e selecione durante o atendimento.</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#e6dccb] bg-white p-2 shadow-sm">
        {[
          ['tags', 'Tags', Tag], ['leads', 'Funil de leads', Users], ['modelos', 'Modelos de mensagem', Save], ['geral', 'Geral', Settings2],
        ].map(([key, label, Icon]: any) => (
          <button key={key} type="button" onClick={() => setSection(key)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${section === key ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-[#fbf7ef]'}`}><Icon size={14} />{label}</button>
        ))}
      </div>

      {feedback && <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} />{feedback}</div>}

      {section === 'tags' && (
        <div className="space-y-4">
          <section className="panel p-4">
            <h3 className="text-sm font-black text-slate-950">Cadastrar tag</h3>
            <p className="mt-1 text-xs text-slate-500">Depois do cadastro, a conversa terá apenas um seletor de tags.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input className="input" value={tagDraft.name} onChange={(e) => setTagDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex.: Urgente, Trabalhista, Cobrança" maxLength={48} />
              <select className="input" value={tagDraft.color} onChange={(e) => setTagDraft((d) => ({ ...d, color: e.target.value }))}>{COLORS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button type="button" disabled={busy || !tagDraft.name.trim()} onClick={() => saveTag({ ...tagDraft, active: true, sort_order: localTags.length * 10 + 10 }, true)} className="btn"><Plus size={14}/>Cadastrar tag</button>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3"><h3 className="text-sm font-black text-slate-950">Tags cadastradas</h3></div>
            <div className="divide-y divide-[#eee7dc]">
              {localTags.map((tag: any) => (
                <div key={tag.id} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_170px_120px_auto] md:items-center">
                  <input className="input compact-input" value={tag.name || ''} onChange={(e) => setLocalTags((rows) => rows.map((row) => row.id === tag.id ? { ...row, name: e.target.value } : row))} />
                  <select className="input compact-input" value={tag.color || 'slate'} onChange={(e) => setLocalTags((rows) => rows.map((row) => row.id === tag.id ? { ...row, color: e.target.value } : row))}>{COLORS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select className="input compact-input" value={tag.active === false ? 'false' : 'true'} onChange={(e) => setLocalTags((rows) => rows.map((row) => row.id === tag.id ? { ...row, active: e.target.value === 'true' } : row))}><option value="true">Ativa</option><option value="false">Desativada</option></select>
                  <div className="flex items-center gap-1.5 md:justify-end"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${colorClass(tag.color)}`}>{tag.name || 'Tag'}</span><button type="button" disabled={busy} onClick={() => saveTag(tag)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white" title="Salvar"><Save size={13}/></button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir a tag \"${tag.name}\"?`)) void api({ action:'delete_tag', id: tag.id }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700" title="Excluir"><Trash2 size={13}/></button></div>
                </div>
              ))}
              {!localTags.length && <p className="p-4 text-xs font-bold text-slate-500">Nenhuma tag cadastrada.</p>}
            </div>
          </section>
        </div>
      )}

      {section === 'leads' && (
        <div className="space-y-4">
          <section className="panel p-4">
            <h3 className="text-sm font-black text-slate-950">Nova etapa do funil</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_170px_auto]">
              <input className="input" value={stageDraft.name} onChange={(e) => setStageDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex.: Aguardando documentos" maxLength={60} />
              <select className="input" value={stageDraft.color} onChange={(e) => setStageDraft((d) => ({ ...d, color: e.target.value }))}>{COLORS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select className="input" value={stageDraft.outcome} onChange={(e) => setStageDraft((d) => ({ ...d, outcome: e.target.value }))}><option value="open">Em andamento</option><option value="won">Convertido</option><option value="lost">Perdido</option></select>
              <button type="button" disabled={busy || !stageDraft.name.trim()} onClick={() => saveStage({ ...stageDraft, active: true, sort_order: localStages.length * 10 + 10 }, true)} className="btn"><Plus size={14}/>Adicionar</button>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3"><h3 className="text-sm font-black text-slate-950">Etapas e nomes do funil</h3><p className="text-xs text-slate-500">Renomeie, ordene, desative ou crie novas etapas.</p></div>
            <div className="divide-y divide-[#eee7dc]">
              {localStages.map((stage: any, index: number) => (
                <div key={stage.id} className="grid gap-2 p-3 lg:grid-cols-[76px_minmax(0,1fr)_150px_150px_115px_auto] lg:items-center">
                  <div className="flex items-center gap-1"><button type="button" onClick={() => { void moveStage(index,-1); }} disabled={index===0} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronUp size={13}/></button><button type="button" onClick={() => { void moveStage(index,1); }} disabled={index===localStages.length-1} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronDown size={13}/></button></div>
                  <input className="input compact-input" value={stage.name || ''} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, name: e.target.value } : row))} />
                  <select className="input compact-input" value={stage.color || 'slate'} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, color: e.target.value } : row))}>{COLORS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <select className="input compact-input" value={stage.outcome || 'open'} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, outcome: e.target.value } : row))}><option value="open">Em andamento</option><option value="won">Convertido</option><option value="lost">Perdido</option></select>
                  <select className="input compact-input" value={stage.active === false ? 'false' : 'true'} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, active: e.target.value === 'true' } : row))}><option value="true">Ativa</option><option value="false">Inativa</option></select>
                  <div className="flex items-center gap-1.5 lg:justify-end"><button type="button" disabled={busy} onClick={() => saveStage(stage)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white" title="Salvar"><Save size={13}/></button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir a etapa \"${stage.name}\"?`)) void api({ action:'delete_stage', id: stage.id }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700" title="Excluir"><Trash2 size={13}/></button></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {section === 'modelos' && <MessageTemplatesManager initialTemplates={templates} onTemplatesChange={onTemplatesChanged} />}

      {section === 'geral' && (
        <section className="panel p-4">
          <h3 className="text-sm font-black text-slate-950">Preferências gerais</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label><span className="label">Nome no singular</span><input className="input mt-1" value={prefs.lead_label_singular || 'Lead'} onChange={(e) => setPrefs((p:any)=>({...p,lead_label_singular:e.target.value}))} placeholder="Lead" /></label>
            <label><span className="label">Nome no plural</span><input className="input mt-1" value={prefs.lead_label_plural || 'Leads'} onChange={(e) => setPrefs((p:any)=>({...p,lead_label_plural:e.target.value}))} placeholder="Leads" /></label>
            <label><span className="label">Etapa inicial</span><select className="input mt-1" value={prefs.default_lead_stage_key || 'novo'} onChange={(e)=>setPrefs((p:any)=>({...p,default_lead_stage_key:e.target.value}))}>{openStages.map((stage:any)=><option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}</select></label>
            <label><span className="label">Área inicial de novas conversas</span><select className="input mt-1" value={prefs.default_department || 'atendimento'} onChange={(e)=>setPrefs((p:any)=>({...p,default_department:e.target.value}))}><option value="atendimento">Atendimento</option><option value="financeiro_juridico">Financeiro/Jurídico</option></select></label>
            <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-[#e6dccb] bg-[#fbf7ef] p-3"><input type="checkbox" checked={prefs.auto_save_client_media !== false} onChange={(e)=>setPrefs((p:any)=>({...p,auto_save_client_media:e.target.checked}))} className="mt-0.5 h-4 w-4" /><span><b className="block text-xs text-slate-900">Salvar mídias recebidas automaticamente na Pasta do Cliente</b><span className="text-[10px] font-semibold text-slate-500">Só vale para conversas vinculadas a clientes.</span></span></label>
          </div>
          <div className="mt-4 flex justify-end"><button type="button" disabled={busy} onClick={async()=>{ const result=await api({ action:'save_preferences', leadLabelSingular:prefs.lead_label_singular, leadLabelPlural:prefs.lead_label_plural, defaultLeadStageKey:prefs.default_lead_stage_key, defaultDepartment:prefs.default_department, autoSaveClientMedia:prefs.auto_save_client_media !== false }); if(result) setFeedback('Preferências salvas.'); }} className="btn"><Save size={14}/>Salvar preferências</button></div>
        </section>
      )}
    </div>
  );
}
