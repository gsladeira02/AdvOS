'use client';

import { useMemo, useState } from 'react';
import { Bot, Check, CheckCircle2, ChevronDown, ChevronUp, Plus, Power, PowerOff, Save, Settings2, Tag, Trash2, Users } from 'lucide-react';
import { MessageTemplatesManager, type MessageTemplateRow } from '@/components/MessageTemplatesManager';

const COLORS = [
  ['slate', 'Cinza'], ['sky', 'Azul'], ['emerald', 'Verde'], ['violet', 'Violeta'], ['amber', 'Amarelo'], ['rose', 'Rosa'], ['red', 'Vermelho'], ['green', 'Verde forte'], ['indigo', 'Índigo'],
] as const;

const colorClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700', sky: 'bg-sky-100 text-sky-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-700', red: 'bg-red-100 text-red-700', green: 'bg-green-100 text-green-700', indigo: 'bg-indigo-100 text-indigo-700',
};

const swatchClasses: Record<string, string> = {
  slate: 'bg-slate-500', sky: 'bg-sky-500', emerald: 'bg-emerald-500', violet: 'bg-violet-500', amber: 'bg-amber-400', rose: 'bg-rose-500', red: 'bg-red-500', green: 'bg-green-600', indigo: 'bg-indigo-500',
};

function colorClass(value?: string) { return colorClasses[String(value || '')] || colorClasses.slate; }

function ColorPalette({ value, onChange, compact = false }: { value?: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`} role="radiogroup" aria-label="Cor">
      {COLORS.map(([color, label]) => {
        const selected = String(value || 'slate') === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => onChange(color)}
            className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} grid shrink-0 place-items-center rounded-full border-2 transition ${swatchClasses[color]} ${selected ? 'border-slate-950 ring-2 ring-slate-300 ring-offset-2' : 'border-white shadow-sm hover:scale-105'}`}
          >
            {selected && <Check size={compact ? 12 : 14} strokeWidth={3} className="text-white drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}

function TagPreview({ name, color }: { name?: string; color?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-slate-400">Prévia</span>
      <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${colorClass(color)}`}>
        <Tag size={10} className="shrink-0" />
        <span className="truncate">{String(name || '').trim() || 'Nome da tag'}</span>
      </span>
    </div>
  );
}

function StagePreview({ name, color }: { name?: string; color?: string }) {
  return <span className={`inline-flex max-w-full rounded-full px-2 py-1 text-[9px] font-black ${colorClass(color)}`}>{String(name || '').trim() || 'Nome da etapa'}</span>;
}

export function WhatsappSettingsCenter({
  tags,
  stages,
  preferences,
  autoReplies = [],
  templates,
  onSettingsChanged,
  onTemplatesChanged,
  initialSection = 'tags',
}: {
  tags: any[];
  stages: any[];
  preferences: any;
  autoReplies?: any[];
  templates: MessageTemplateRow[];
  onSettingsChanged?: (next: { tags: any[]; stages: any[]; preferences: any; autoReplies?: any[] }) => void;
  onTemplatesChanged?: (next: MessageTemplateRow[]) => void;
  initialSection?: string;
}) {
  const [section, setSection] = useState(initialSection === 'modelos' ? 'modelos' : initialSection === 'leads' ? 'leads' : initialSection === 'automaticas' ? 'automaticas' : initialSection === 'geral' ? 'geral' : 'tags');
  const [localTags, setLocalTags] = useState<any[]>(tags || []);
  const [localStages, setLocalStages] = useState<any[]>(stages || []);
  const [localAutoReplies, setLocalAutoReplies] = useState<any[]>(autoReplies || []);
  const [prefs, setPrefs] = useState<any>(preferences || {});
  const [autoDraft, setAutoDraft] = useState({ name: 'Boas-vindas para novos leads', trigger_type: 'new_lead', message: '', keywords: '', department: '', active: true });
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
      setLocalAutoReplies(result.autoReplies || []);
      setPrefs(result.preferences || {});
      onSettingsChanged?.({ tags: result.tags || [], stages: result.stages || [], preferences: result.preferences || {}, autoReplies: result.autoReplies || [] });
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

  async function setTagActive(tag: any, active: boolean) {
    const result = await api({ action: 'set_tag_active', id: tag.id, active });
    if (result) setFeedback(active ? 'Tag ativada.' : 'Tag desativada. Ela não aparece para novas seleções, mas pode ser reativada quando quiser.');
  }

  async function deleteTag(tag: any) {
    const name = String(tag?.name || 'esta tag');
    const confirmed = window.confirm(`Excluir definitivamente a tag \"${name}\"?\n\nEla será removida de todas as conversas em que estiver aplicada. Essa ação não pode ser desfeita.`);
    if (!confirmed) return;
    const result = await api({ action: 'delete_tag', id: tag.id });
    if (result) setFeedback('Tag excluída definitivamente.');
  }

  async function saveStage(stage: any, isNew = false) {
    const result = await api({ action: 'save_stage', id: stage.id || '', stageKey: stage.stage_key || '', name: stage.name, color: stage.color, active: stage.active !== false, sortOrder: stage.sort_order || 0, outcome: stage.outcome || 'open' });
    if (result) { if (isNew) setStageDraft({ name: '', color: 'sky', outcome: 'open' }); setFeedback(isNew ? 'Etapa cadastrada.' : 'Etapa atualizada.'); }
  }

  async function saveAutoReply(rule: any, isNew = false) {
    const result = await api({
      action: 'save_auto_reply',
      id: rule.id || '',
      name: rule.name,
      triggerType: rule.trigger_type || 'new_lead',
      message: rule.message,
      keywords: Array.isArray(rule.keywords) ? rule.keywords : String(rule.keywords || '').split(','),
      department: rule.department || '',
      active: rule.active !== false,
      sortOrder: rule.sort_order || 10,
    });
    if (result) {
      if (isNew) setAutoDraft({ name: 'Boas-vindas para novos leads', trigger_type: 'new_lead', message: '', keywords: '', department: '', active: true });
      setFeedback(isNew ? 'Resposta automática cadastrada.' : 'Resposta automática atualizada.');
    }
  }

  async function setAutoReplyActive(rule: any, active: boolean) {
    const result = await api({ action: 'set_auto_reply_active', id: rule.id, active });
    if (result) setFeedback(active ? 'Resposta automática ativada.' : 'Resposta automática desativada.');
  }

  async function deleteAutoReply(rule: any) {
    if (!window.confirm(`Excluir a resposta automática "${String(rule?.name || '')}"?`)) return;
    const result = await api({ action: 'delete_auto_reply', id: rule.id });
    if (result) setFeedback('Resposta automática excluída.');
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
          ['tags', 'Tags', Tag], ['leads', 'Funil de leads', Users], ['automaticas', 'Respostas automáticas', Bot], ['modelos', 'Modelos de mensagem', Save], ['geral', 'Geral', Settings2],
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
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-end">
              <label className="min-w-0"><span className="label">Nome da tag</span><input className="input mt-1" value={tagDraft.name} onChange={(e) => setTagDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex.: Urgente, Trabalhista, Cobrança" maxLength={48} /></label>
              <div className="min-w-0"><span className="label">Cor</span><div className="mt-2"><ColorPalette value={tagDraft.color} onChange={(color) => setTagDraft((d) => ({ ...d, color }))} /></div></div>
              <button type="button" disabled={busy || !tagDraft.name.trim()} onClick={() => saveTag({ ...tagDraft, active: true, sort_order: localTags.length * 10 + 10 }, true)} className="btn"><Plus size={14}/>Cadastrar tag</button>
            </div>
            <div className="mt-3 rounded-xl border border-[#e6dccb] bg-[#fbf7ef] px-3 py-2"><TagPreview name={tagDraft.name} color={tagDraft.color} /></div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3"><h3 className="text-sm font-black text-slate-950">Tags cadastradas</h3></div>
            <div className="divide-y divide-[#eee7dc]">
              {localTags.map((tag: any) => (
                <div key={tag.id} className="p-3">
                  <div className={`grid gap-3 xl:grid-cols-[minmax(190px,1fr)_auto_minmax(150px,auto)_auto] xl:items-center ${tag.active === false ? 'opacity-75' : ''}`}>
                    <input className="input compact-input" value={tag.name || ''} onChange={(e) => setLocalTags((rows) => rows.map((row) => row.id === tag.id ? { ...row, name: e.target.value } : row))} aria-label="Nome da tag" />
                    <ColorPalette compact value={tag.color || 'slate'} onChange={(color) => setLocalTags((rows) => rows.map((row) => row.id === tag.id ? { ...row, color } : row))} />
                    <div className="min-w-0">
                      <TagPreview name={tag.name} color={tag.color} />
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${tag.active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{tag.active === false ? 'Desativada' : 'Ativa'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                      <button type="button" disabled={busy || !String(tag.name || '').trim()} onClick={() => saveTag(tag)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[10px] font-black text-white disabled:opacity-50" title="Salvar alterações"><Save size={13}/>Salvar</button>
                      {tag.active === false ? (
                        <button type="button" disabled={busy} onClick={() => setTagActive(tag, true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-black text-emerald-700 disabled:opacity-50" title="Ativar tag"><Power size={13}/>Ativar</button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => setTagActive(tag, false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-black text-amber-800 disabled:opacity-50" title="Desativar tag"><PowerOff size={13}/>Desativar</button>
                      )}
                      <button type="button" disabled={busy} onClick={() => deleteTag(tag)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[10px] font-black text-red-700 disabled:opacity-50" title="Excluir definitivamente"><Trash2 size={13}/>Excluir</button>
                    </div>
                  </div>
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
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_170px_auto] lg:items-end">
              <label className="min-w-0"><span className="label">Nome da etapa</span><input className="input mt-1" value={stageDraft.name} onChange={(e) => setStageDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex.: Aguardando documentos" maxLength={60} /></label>
              <div><span className="label">Cor</span><div className="mt-2"><ColorPalette value={stageDraft.color} onChange={(color) => setStageDraft((d) => ({ ...d, color }))} /></div></div>
              <label><span className="label">Resultado</span><select className="input mt-1" value={stageDraft.outcome} onChange={(e) => setStageDraft((d) => ({ ...d, outcome: e.target.value }))}><option value="open">Em andamento</option><option value="won">Convertido</option><option value="lost">Perdido</option></select></label>
              <button type="button" disabled={busy || !stageDraft.name.trim()} onClick={() => saveStage({ ...stageDraft, active: true, sort_order: localStages.length * 10 + 10 }, true)} className="btn"><Plus size={14}/>Adicionar</button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#e6dccb] bg-[#fbf7ef] px-3 py-2"><span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Prévia</span><StagePreview name={stageDraft.name} color={stageDraft.color} /></div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3"><h3 className="text-sm font-black text-slate-950">Etapas e nomes do funil</h3><p className="text-xs text-slate-500">Renomeie, ordene, desative ou crie novas etapas.</p></div>
            <div className="divide-y divide-[#eee7dc]">
              {localStages.map((stage: any, index: number) => (
                <div key={stage.id} className="grid gap-3 p-3 xl:grid-cols-[76px_minmax(180px,1fr)_auto_145px_110px_minmax(140px,auto)_auto] xl:items-center">
                  <div className="flex items-center gap-1"><button type="button" onClick={() => { void moveStage(index,-1); }} disabled={index===0} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronUp size={13}/></button><button type="button" onClick={() => { void moveStage(index,1); }} disabled={index===localStages.length-1} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronDown size={13}/></button></div>
                  <input className="input compact-input" value={stage.name || ''} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, name: e.target.value } : row))} />
                  <ColorPalette compact value={stage.color || 'slate'} onChange={(color) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, color } : row))} />
                  <select className="input compact-input" value={stage.outcome || 'open'} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, outcome: e.target.value } : row))}><option value="open">Em andamento</option><option value="won">Convertido</option><option value="lost">Perdido</option></select>
                  <select className="input compact-input" value={stage.active === false ? 'false' : 'true'} onChange={(e) => setLocalStages((rows) => rows.map((row) => row.id === stage.id ? { ...row, active: e.target.value === 'true' } : row))}><option value="true">Ativa</option><option value="false">Inativa</option></select>
                  <div className="min-w-0"><StagePreview name={stage.name} color={stage.color} /></div>
                  <div className="flex items-center gap-1.5 xl:justify-end"><button type="button" disabled={busy} onClick={() => saveStage(stage)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white" title="Salvar"><Save size={13}/></button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir a etapa \"${stage.name}\"?`)) void api({ action:'delete_stage', id: stage.id }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700" title="Excluir"><Trash2 size={13}/></button></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {section === 'automaticas' && (
        <div className="space-y-4">
          <section className="panel p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#075e54]"><Bot size={18}/></div>
              <div className="min-w-0"><h3 className="text-sm font-black text-slate-950">Nova resposta automática</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Novos leads recebem a mensagem apenas uma vez por regra e conversa. Repetições do webhook da Meta não geram mensagens duplicadas.</p></div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label><span className="label">Nome da automação</span><input className="input mt-1" value={autoDraft.name} onChange={(e)=>setAutoDraft((d)=>({...d,name:e.target.value}))} maxLength={80} /></label>
              <label><span className="label">Quando enviar</span><select className="input mt-1" value={autoDraft.trigger_type} onChange={(e)=>setAutoDraft((d)=>({...d,trigger_type:e.target.value}))}><option value="new_lead">Primeiro contato de novo lead</option><option value="keyword">Ao receber palavra-chave</option></select></label>
              <label><span className="label">Caixa de entrada</span><select className="input mt-1" value={autoDraft.department} onChange={(e)=>setAutoDraft((d)=>({...d,department:e.target.value}))}><option value="">Qualquer caixa</option><option value="atendimento">Atendimento</option><option value="financeiro_juridico">Financeiro/Jurídico</option></select></label>
              {autoDraft.trigger_type === 'keyword' && <label><span className="label">Palavras-chave</span><input className="input mt-1" value={autoDraft.keywords} onChange={(e)=>setAutoDraft((d)=>({...d,keywords:e.target.value}))} placeholder="divórcio, trabalhista, inventário" /><span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Separe por vírgulas. A comparação ignora maiúsculas e acentos.</span></label>}
              <label className="md:col-span-2"><span className="label">Mensagem</span><textarea className="input mt-1 min-h-[130px] resize-y leading-relaxed" value={autoDraft.message} onChange={(e)=>setAutoDraft((d)=>({...d,message:e.target.value}))} maxLength={4096} placeholder={'Olá, {{primeiro_nome}}! Seja bem-vindo(a) ao {{escritorio}}.\nRecebemos sua mensagem e em breve continuaremos seu atendimento.'}/><span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">Variáveis: <b>{'{{nome}}'}</b>, <b>{'{{primeiro_nome}}'}</b>, <b>{'{{telefone}}'}</b> e <b>{'{{escritorio}}'}</b>.</span></label>
            </div>
            <div className="mt-4 flex justify-end"><button type="button" disabled={busy || !autoDraft.name.trim() || !autoDraft.message.trim() || (autoDraft.trigger_type === 'keyword' && !autoDraft.keywords.trim())} onClick={()=>saveAutoReply({...autoDraft,sort_order:localAutoReplies.length*10+10},true)} className="btn"><Plus size={14}/>Cadastrar automação</button></div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#e6dccb] bg-[#fbf7ef] px-4 py-3"><h3 className="text-sm font-black text-slate-950">Respostas automáticas cadastradas</h3><p className="text-xs leading-relaxed text-slate-500">O histórico identifica mensagens enviadas pela automação. Desative uma regra sem apagá-la quando quiser interromper os disparos.</p></div>
            <div className="divide-y divide-[#eee7dc]">
              {localAutoReplies.map((rule:any)=>(
                <div key={rule.id} className={`p-4 ${rule.active===false?'opacity-70':''}`}>
                  <div className="grid gap-3 xl:grid-cols-[minmax(170px,.8fr)_170px_170px_minmax(300px,1.6fr)_auto] xl:items-start">
                    <label><span className="label">Nome</span><input className="input mt-1 compact-input" value={rule.name||''} onChange={(e)=>setLocalAutoReplies((rows)=>rows.map((row)=>row.id===rule.id?{...row,name:e.target.value}:row))}/></label>
                    <label><span className="label">Gatilho</span><select className="input mt-1 compact-input" value={rule.trigger_type||'new_lead'} onChange={(e)=>setLocalAutoReplies((rows)=>rows.map((row)=>row.id===rule.id?{...row,trigger_type:e.target.value}:row))}><option value="new_lead">Novo lead</option><option value="keyword">Palavra-chave</option></select></label>
                    <label><span className="label">Caixa</span><select className="input mt-1 compact-input" value={rule.department||''} onChange={(e)=>setLocalAutoReplies((rows)=>rows.map((row)=>row.id===rule.id?{...row,department:e.target.value||null}:row))}><option value="">Qualquer</option><option value="atendimento">Atendimento</option><option value="financeiro_juridico">Financeiro/Jurídico</option></select></label>
                    <div className="space-y-2"><label><span className="label">Mensagem</span><textarea className="input mt-1 min-h-[92px] resize-y text-xs leading-relaxed" value={rule.message||''} onChange={(e)=>setLocalAutoReplies((rows)=>rows.map((row)=>row.id===rule.id?{...row,message:e.target.value}:row))}/></label>{rule.trigger_type==='keyword'&&<label><span className="label">Palavras-chave</span><input className="input mt-1 compact-input" value={(Array.isArray(rule.keywords)?rule.keywords:[]).join(', ')} onChange={(e)=>setLocalAutoReplies((rows)=>rows.map((row)=>row.id===rule.id?{...row,keywords:e.target.value.split(',').map((v)=>v.trim()).filter(Boolean)}:row))}/></label>}</div>
                    <div className="flex flex-wrap gap-1.5 xl:justify-end"><button type="button" disabled={busy} onClick={()=>saveAutoReply(rule)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[10px] font-black text-white"><Save size={13}/>Salvar</button>{rule.active===false?<button type="button" disabled={busy} onClick={()=>setAutoReplyActive(rule,true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-black text-emerald-700"><Power size={13}/>Ativar</button>:<button type="button" disabled={busy} onClick={()=>setAutoReplyActive(rule,false)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-black text-amber-800"><PowerOff size={13}/>Desativar</button>}<button type="button" disabled={busy} onClick={()=>deleteAutoReply(rule)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[10px] font-black text-red-700"><Trash2 size={13}/>Excluir</button></div>
                  </div>
                </div>
              ))}
              {!localAutoReplies.length&&<p className="p-4 text-xs font-bold leading-relaxed text-slate-500">Nenhuma resposta automática cadastrada ainda. Rode a migration v9.56 no Supabase e cadastre a primeira automação acima.</p>}
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
