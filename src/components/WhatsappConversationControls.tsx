'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ChevronDown, RotateCcw, Tag, UserPlus, X } from 'lucide-react';
import { WhatsappOperationsPanel } from '@/components/WhatsappOperationsPanel';

const colorClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700', sky: 'bg-sky-100 text-sky-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-700', red: 'bg-red-100 text-red-700', green: 'bg-green-100 text-green-700', indigo: 'bg-indigo-100 text-indigo-700',
};
function tagTone(value?: string) { return colorClasses[String(value || '')] || colorClasses.slate; }
function departmentLabel(value?: string | null) { return value === 'financeiro_juridico' ? 'Financeiro/Jurídico' : 'Atendimento'; }
function closedAtLabel(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function WhatsappConversationControls({
  conversation,
  availableTags = [],
  leadStages = [],
  leadLabel = 'Lead',
  teamUsers = [],
  currentUserId = '',
  canConfigure = false,
  onChanged,
}: {
  conversation: any;
  availableTags?: any[];
  leadStages?: any[];
  leadLabel?: string;
  teamUsers?: any[];
  currentUserId?: string;
  canConfigure?: boolean;
  onChanged?: (change?: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [clientModal, setClientModal] = useState(false);
  const [leadModal, setLeadModal] = useState(false);
  const [clientName, setClientName] = useState(conversation?.lead?.name || conversation?.lead_name || '');
  const [clientEmail, setClientEmail] = useState(conversation?.lead?.email || '');
  const [clientDoc, setClientDoc] = useState('');
  const [clientNotes, setClientNotes] = useState(conversation?.lead?.notes || '');
  const [leadName, setLeadName] = useState(conversation?.lead?.name || conversation?.lead_name || '');
  const [leadEmail, setLeadEmail] = useState(conversation?.lead?.email || '');
  const [leadService, setLeadService] = useState(conversation?.lead?.service_interest || '');
  const [leadNotes, setLeadNotes] = useState(conversation?.lead?.notes || '');
  const [leadStage, setLeadStage] = useState(conversation?.lead?.stage || 'novo');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(Array.isArray(conversation?.tag_ids) ? conversation.tag_ids.map(String) : []);
  const [tagsOpen, setTagsOpen] = useState(false);

  const activeTags = useMemo(() => (availableTags || []).filter((tag: any) => tag.active !== false), [availableTags]);
  const activeTagIdSet = useMemo(() => new Set(activeTags.map((tag: any) => String(tag.id))), [activeTags]);

  useEffect(() => {
    const ids = Array.isArray(conversation?.tag_ids) ? conversation.tag_ids.map(String).filter((id: string) => activeTagIdSet.has(id)) : [];
    setSelectedTagIds(ids);
    setLeadStage(conversation?.lead?.stage || 'novo');
    setTagsOpen(false);
    setLeadModal(false);
    setClientModal(false);
    setFeedback(null);
  }, [conversation?.id, conversation?.tag_ids, conversation?.lead?.stage, activeTagIdSet]);

  const selectedTags = useMemo(() => activeTags.filter((tag: any) => selectedTagIds.includes(String(tag.id))), [activeTags, selectedTagIds]);
  const visibleSelectedTags = selectedTags.slice(0, 2);
  const selectableStages = useMemo(() => (leadStages || []).filter((stage: any) => stage.active !== false && stage.outcome !== 'won'), [leadStages]);
  const currentStage = leadStages.find((stage: any) => String(stage.stage_key) === String(conversation?.lead?.stage));
  const isClient = Boolean(conversation?.client_id || conversation?.clients?.id);
  const isLead = Boolean(!isClient && conversation?.lead);
  const department = conversation?.department || 'atendimento';
  const isClosed = Boolean(conversation?.closed_at);

  async function action(payload: Record<string, any>) {
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/conversations/manage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ conversationId: conversation?.id, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível atualizar a conversa.');
      onChanged?.(result);
      return result;
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível atualizar a conversa.');
      return null;
    } finally { setBusy(false); }
  }

  async function toggleTag(tagId: string) {
    const next = selectedTagIds.includes(tagId) ? selectedTagIds.filter((id) => id !== tagId) : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    const result = await action({ action: 'set_tags', tagIds: next });
    if (!result) setSelectedTagIds(Array.isArray(conversation?.tag_ids) ? conversation.tag_ids.map(String) : []);
  }

  async function transferConversation() {
    const nextDepartment = department === 'atendimento' ? 'financeiro_juridico' : 'atendimento';
    const result = await action({ action: 'set_department', department: nextDepartment });
    if (result) {
      setTagsOpen(false);
      setFeedback(`Conversa transferida para ${departmentLabel(nextDepartment)}. Você permanece na caixa de entrada atual.`);
    }
  }

  function openLeadDetails() {
    setLeadName(conversation?.lead?.name || conversation?.lead_name || ''); setLeadEmail(conversation?.lead?.email || ''); setLeadService(conversation?.lead?.service_interest || ''); setLeadNotes(conversation?.lead?.notes || ''); setLeadStage(conversation?.lead?.stage || 'novo'); setLeadModal(true);
  }

  async function saveLeadDetails() {
    const result = await action({ action: 'update_lead', stage: leadStage, name: leadName, email: leadEmail, serviceInterest: leadService, notes: leadNotes });
    if (result) { setLeadModal(false); setFeedback(`${leadLabel} atualizado.`); }
  }

  function openClientRegistration() {
    setClientName(conversation?.lead?.name || conversation?.lead_name || ''); setClientEmail(conversation?.lead?.email || ''); setClientDoc(''); setClientNotes(conversation?.lead?.notes || ''); setClientModal(true);
  }

  async function convertToClient() {
    if (!clientName.trim()) { setFeedback('Informe o nome do cliente.'); return; }
    const result = await action({ action: 'convert_to_client', name: clientName, email: clientEmail, doc: clientDoc, notes: clientNotes });
    if (result) { setClientModal(false); setFeedback(result.created ? 'Cliente cadastrado e conversa vinculada.' : 'Cliente existente vinculado à conversa.'); }
  }

  return (
    <>
      <div className="whatsapp-conversation-controls shrink-0 border-b border-[#d7ded4] bg-white px-3 py-2">
        <div className="whatsapp-control-row flex flex-wrap items-center gap-2">
          {isClosed ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-700"><Archive size={10}/>Encerrada</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black text-slate-500">Origem: {departmentLabel(conversation?.closed_from_department || department)}</span>
              <button type="button" disabled={busy || conversation?.virtual} onClick={() => action({ action: 'reopen_conversation' })} className="inline-flex items-center gap-1 rounded-full bg-[#075e54] px-2.5 py-1 text-[9px] font-black text-white transition hover:bg-[#064e47] disabled:opacity-50"><RotateCcw size={10}/>Reabrir atendimento</button>
            </>
          ) : (
            <>
              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${department === 'financeiro_juridico' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{departmentLabel(department)}</span>
              <button type="button" disabled={busy || conversation?.virtual} onClick={() => void transferConversation()} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Transferir para {department === 'atendimento' ? 'Financeiro/Jurídico' : 'Atendimento'}</button>
              <button type="button" disabled={busy || conversation?.virtual} onClick={() => action({ action: 'close_conversation' })} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[9px] font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"><Archive size={10}/>Encerrar</button>
            </>
          )}

          {isLead && (
            <select value={conversation?.lead?.stage || leadStage} disabled={busy} onChange={(event) => action({ action: 'update_lead', stage: event.target.value })} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800 outline-none" title={`Etapa do ${leadLabel.toLowerCase()}`}>
              {selectableStages.map((stage: any) => <option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}
            </select>
          )}
          {isLead && <button type="button" disabled={busy} onClick={openLeadDetails} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[9px] font-black text-amber-800 hover:bg-amber-50 disabled:opacity-50">Detalhes do {leadLabel.toLowerCase()}</button>}
          {isLead && <button type="button" disabled={busy} onClick={openClientRegistration} className="inline-flex items-center gap-1 rounded-full bg-[#075e54] px-2.5 py-1 text-[9px] font-black text-white hover:bg-[#064e47] disabled:opacity-50"><UserPlus size={11}/>Cadastrar como cliente</button>}
          {isClient && <a href={`/app/clientes/${encodeURIComponent(String(conversation?.client_id || conversation?.clients?.id))}`} className="rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black text-sky-700 hover:bg-sky-100">Abrir Pasta do Cliente</a>}
        </div>

        {!conversation?.virtual && (
          <div className="whatsapp-tag-row mt-2 flex flex-wrap items-center gap-1.5">
            {visibleSelectedTags.map((tag: any) => <span key={tag.id} className={`inline-flex max-w-[150px] items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${tagTone(tag.color)}`}><Tag size={10} className="shrink-0"/><span className="truncate">{tag.name}</span></span>)}
            {selectedTags.length > visibleSelectedTags.length && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">+{selectedTags.length - visibleSelectedTags.length}</span>}
            <div className="relative">
              <button type="button" aria-expanded={tagsOpen} onClick={() => setTagsOpen((value) => !value)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-700 hover:bg-slate-50"><Tag size={10}/>{selectedTags.length ? 'Alterar tags' : 'Selecionar tags'}<ChevronDown size={10} className={tagsOpen ? 'rotate-180' : ''}/></button>
              {tagsOpen && <div className="whatsapp-tag-picker absolute left-0 top-full z-[70] mt-1 w-64 max-w-[80vw] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="mb-1 flex items-center justify-between gap-2 px-2"><p className="text-[9px] font-black uppercase text-slate-400">Tags cadastradas</p><button type="button" onClick={() => setTagsOpen(false)} className="grid h-6 w-6 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Fechar seleção de tags"><X size={12}/></button></div>
                <div className="max-h-56 overflow-y-auto">
                  {activeTags.map((tag: any) => {
                    const checked = selectedTagIds.includes(String(tag.id));
                    return <button key={tag.id} type="button" disabled={busy} onClick={() => toggleTag(String(tag.id))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? 'border-[#075e54] bg-[#075e54] text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check size={10}/>}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black ${tagTone(tag.color)}`}>{tag.name}</span></button>;
                  })}
                  {!activeTags.length && <p className="px-2 py-3 text-[10px] font-bold text-slate-500">Cadastre tags em WhatsApp → Configurações.</p>}
                </div>
              </div>}
            </div>
          </div>
        )}

        <WhatsappOperationsPanel conversation={conversation} teamUsers={teamUsers} currentUserId={currentUserId} canConfigure={canConfigure} onChanged={onChanged} />

        {isClosed && <p className="mt-1.5 text-[9px] font-bold text-slate-500">Encerrada em {closedAtLabel(conversation?.closed_at) || 'data não informada'}. O histórico permanece disponível.</p>}
        {isLead && <p className="mt-1.5 text-[9px] font-bold text-amber-700">{leadLabel}: {currentStage?.name || conversation?.lead?.stage || 'Sem etapa'} · só vira cliente após confirmação manual.</p>}
        {feedback && <p className="mt-1.5 text-[9px] font-bold text-slate-600">{feedback}</p>}
      </div>

      {leadModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeadModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Detalhes do {leadLabel.toLowerCase()}</h3><p className="mt-0.5 text-[10px] font-semibold text-slate-500">Qualifique o contato sem transformá-lo em cliente.</p></div><button type="button" onClick={() => setLeadModal(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15}/></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label><span className="label">Etapa</span><select className="input mt-1" value={leadStage} onChange={(e) => setLeadStage(e.target.value)}>{selectableStages.map((stage:any)=><option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}</select></label>
              <label><span className="label">Nome</span><input className="input mt-1" value={leadName} onChange={(e) => setLeadName(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">E-mail</span><input type="email" className="input mt-1" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">Interesse / área jurídica</span><input className="input mt-1" value={leadService} onChange={(e) => setLeadService(e.target.value)} placeholder="Ex.: Trabalhista, Família, Empresarial..." /></label>
              <label className="sm:col-span-2"><span className="label">Observações</span><textarea className="input mt-1 min-h-28 resize-y" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} /></label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setLeadModal(false)} className="btn btn-secondary">Cancelar</button><button type="button" disabled={busy} onClick={saveLeadDetails} className="btn">{busy ? 'Salvando...' : `Salvar ${leadLabel.toLowerCase()}`}</button></div>
          </div>
        </div>
      )}

      {clientModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setClientModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Cadastrar como cliente</h3><p className="mt-0.5 text-[10px] font-semibold text-slate-500">Revise os dados. Nada é cadastrado automaticamente.</p></div><button type="button" onClick={() => setClientModal(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15}/></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="label">Nome *</span><input className="input mt-1" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label>
              <label><span className="label">WhatsApp</span><input className="input mt-1 bg-slate-50" value={conversation?.phone || ''} readOnly /></label>
              <label><span className="label">CPF/CNPJ</span><input className="input mt-1" value={clientDoc} onChange={(e) => setClientDoc(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">E-mail</span><input className="input mt-1" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">Observações</span><textarea className="input mt-1 min-h-24 resize-y" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} /></label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setClientModal(false)} className="btn btn-secondary">Cancelar</button><button type="button" disabled={busy || !clientName.trim()} onClick={convertToClient} className="btn">{busy ? 'Salvando...' : 'Cadastrar como cliente'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
