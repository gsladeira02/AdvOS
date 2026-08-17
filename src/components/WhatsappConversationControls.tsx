'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ChevronDown, Megaphone, RotateCcw, Tag, UserPlus, X } from 'lucide-react';
import { WhatsappOperationsPanel } from '@/components/WhatsappOperationsPanel';

const LOSS_REASON_OPTIONS = [
  ['sem_resposta', 'Não respondeu'],
  ['sem_interesse', 'Sem interesse'],
  ['sem_condicoes_financeiras', 'Sem condições financeiras'],
  ['caso_inviavel', 'Caso inviável'],
  ['contratou_outro', 'Contratou outro escritório'],
  ['fora_area', 'Fora da área de atuação'],
  ['contato_duplicado', 'Contato duplicado'],
  ['outro', 'Outro'],
] as const;

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
  const [lossReason, setLossReason] = useState(conversation?.lead?.loss_reason || '');
  const [lossNotes, setLossNotes] = useState(conversation?.lead?.loss_notes || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(Array.isArray(conversation?.tag_ids) ? conversation.tag_ids.map(String) : []);
  const [tagsOpen, setTagsOpen] = useState(false);

  const activeTags = useMemo(() => (availableTags || []).filter((tag: any) => tag.active !== false), [availableTags]);
  const activeTagIdSet = useMemo(() => new Set(activeTags.map((tag: any) => String(tag.id))), [activeTags]);

  useEffect(() => {
    const ids = Array.isArray(conversation?.tag_ids) ? conversation.tag_ids.map(String).filter((id: string) => activeTagIdSet.has(id)) : [];
    setSelectedTagIds(ids);
    setLeadStage(conversation?.lead?.stage || 'novo');
    setLossReason(conversation?.lead?.loss_reason || '');
    setLossNotes(conversation?.lead?.loss_notes || '');
    setTagsOpen(false);
    setLeadModal(false);
    setClientModal(false);
    setFeedback(null);
  }, [conversation?.id, conversation?.tag_ids, conversation?.lead?.stage, conversation?.lead?.loss_reason, conversation?.lead?.loss_notes, activeTagIdSet]);

  const selectedTags = useMemo(() => activeTags.filter((tag: any) => selectedTagIds.includes(String(tag.id))), [activeTags, selectedTagIds]);
  const visibleSelectedTags = selectedTags.slice(0, 2);
  const selectableStages = useMemo(() => (leadStages || []).filter((stage: any) => stage.active !== false), [leadStages]);
  const currentStage = leadStages.find((stage: any) => String(stage.stage_key) === String(conversation?.lead?.stage));
  const isClient = Boolean(conversation?.client_id || conversation?.clients?.id);
  const isLead = Boolean(conversation?.lead);
  const canConvertLead = isLead && !isClient;
  const department = conversation?.department || 'atendimento';
  const isClosed = Boolean(conversation?.closed_at);
  const attributionLead = conversation?.lead || {};
  const paidPlatform = attributionLead?.source_platform === 'meta' ? 'Meta Ads' : attributionLead?.source_platform === 'google' ? 'Google Ads' : '';
  const attributionCampaign = attributionLead?.campaign_name || attributionLead?.utm_campaign || attributionLead?.campaign_id || '';
  const attributionAdGroup = attributionLead?.adgroup_name || attributionLead?.adgroup_id || attributionLead?.adset_name || attributionLead?.adset_id || '';
  const attributionAd = attributionLead?.ad_name || attributionLead?.referral_headline || attributionLead?.ad_id || attributionLead?.creative_id || '';
  const attributionClick = attributionLead?.gclid || attributionLead?.gbraid || attributionLead?.wbraid || attributionLead?.click_id || '';
  const selectedStageConfig = leadStages.find((stage: any) => String(stage.stage_key) === String(leadStage));
  const selectedStageIsLost = selectedStageConfig?.outcome === 'lost';

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
    setLeadName(conversation?.lead?.name || conversation?.lead_name || '');
    setLeadEmail(conversation?.lead?.email || '');
    setLeadService(conversation?.lead?.service_interest || '');
    setLeadNotes(conversation?.lead?.notes || '');
    setLeadStage(conversation?.lead?.stage || 'novo');
    setLossReason(conversation?.lead?.loss_reason || '');
    setLossNotes(conversation?.lead?.loss_notes || '');
    setLeadModal(true);
  }

  async function handleQuickStageChange(stage: string) {
    const config = leadStages.find((item: any) => String(item.stage_key) === String(stage));
    if (config?.outcome === 'lost') {
      setLeadStage(stage);
      setLossReason(conversation?.lead?.loss_reason || '');
      setLossNotes(conversation?.lead?.loss_notes || '');
      setLeadModal(true);
      return;
    }
    const result = await action({ action: 'update_lead', stage });
    if (result?.lead) setLeadStage(result.lead.stage || stage);
  }

  async function saveLeadDetails() {
    if (selectedStageIsLost && !lossReason) { setFeedback('Selecione o motivo da perda.'); return; }
    const result = await action({ action: 'update_lead', stage: leadStage, name: leadName, email: leadEmail, serviceInterest: leadService, notes: leadNotes, lossReason: selectedStageIsLost ? lossReason : null, lossNotes: selectedStageIsLost ? lossNotes : null });
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
            <select value={conversation?.lead?.stage || leadStage} disabled={busy} onChange={(event) => void handleQuickStageChange(event.target.value)} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800 outline-none" title={`Etapa do ${leadLabel.toLowerCase()}`}>
              {selectableStages.map((stage: any) => <option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}
            </select>
          )}
          {isLead && <button type="button" disabled={busy} onClick={openLeadDetails} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[9px] font-black text-amber-800 hover:bg-amber-50 disabled:opacity-50">Detalhes do {leadLabel.toLowerCase()}</button>}
          {canConvertLead && <button type="button" disabled={busy} onClick={openClientRegistration} className="inline-flex items-center gap-1 rounded-full bg-[#075e54] px-2.5 py-1 text-[9px] font-black text-white hover:bg-[#064e47] disabled:opacity-50"><UserPlus size={11}/>Cadastrar como cliente</button>}
          {isClient && <a href={`/app/clientes/${encodeURIComponent(String(conversation?.client_id || conversation?.clients?.id))}`} className="rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black text-sky-700 hover:bg-sky-100">Abrir Pasta do Cliente</a>}
        </div>

        {isLead && paidPlatform && (
          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[9px] font-black text-emerald-800 shadow-sm"><Megaphone size={10}/>{paidPlatform}</span>
              {attributionLead?.qualified_automatically && <span className="rounded-full bg-emerald-700 px-2 py-1 text-[9px] font-black text-white">Qualificado automaticamente · {Number(attributionLead?.qualification_score || 0)}/100</span>}
              {attributionLead?.service_interest && <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-700">Área: {attributionLead.service_interest}</span>}
            </div>
            <div className="mt-1.5 grid gap-x-4 gap-y-1 text-[9px] font-semibold leading-relaxed text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
              {attributionCampaign && <p className="min-w-0 truncate" title={String(attributionCampaign)}><b className="text-slate-800">Campanha:</b> {attributionCampaign}</p>}
              {attributionAdGroup && <p className="min-w-0 truncate" title={String(attributionAdGroup)}><b className="text-slate-800">Grupo/conjunto:</b> {attributionAdGroup}</p>}
              {attributionAd && <p className="min-w-0 truncate" title={String(attributionAd)}><b className="text-slate-800">Anúncio:</b> {attributionAd}</p>}
              {attributionLead?.utm_term && <p className="min-w-0 truncate" title={String(attributionLead.utm_term)}><b className="text-slate-800">Busca/termo:</b> {attributionLead.utm_term}</p>}
              {attributionClick && <p className="min-w-0 truncate" title={String(attributionClick)}><b className="text-slate-800">Clique:</b> {attributionClick}</p>}
            </div>
          </div>
        )}

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
        {isLead && <p className="mt-1.5 text-[9px] font-bold text-amber-700">{leadLabel}: {currentStage?.name || conversation?.lead?.stage || 'Sem etapa'}{!isClient ? ' · só vira cliente após confirmação manual.' : ' · cliente vinculado ao funil comercial.'}</p>}
        {isLead && currentStage?.outcome === 'lost' && conversation?.lead?.loss_reason && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-[9px] font-bold text-red-700">Motivo da perda: {LOSS_REASON_OPTIONS.find(([key]) => key === conversation.lead.loss_reason)?.[1] || conversation.lead.loss_reason}{conversation?.lead?.loss_notes ? ` · ${conversation.lead.loss_notes}` : ''}</p>}
        {feedback && <p className="mt-1.5 text-[9px] font-bold text-slate-600">{feedback}</p>}
      </div>

      {leadModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeadModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950">Detalhes do {leadLabel.toLowerCase()}</h3><p className="mt-0.5 text-[10px] font-semibold text-slate-500">Atualize a etapa, a qualificação e os dados comerciais deste contato.</p></div><button type="button" onClick={() => setLeadModal(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15}/></button></div>
            {paidPlatform && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-semibold leading-relaxed text-slate-700"><div className="flex flex-wrap items-center gap-2"><b className="text-emerald-900">Origem: {paidPlatform}</b>{attributionLead?.qualified_automatically && <span className="rounded-full bg-emerald-700 px-2 py-0.5 font-black text-white">Score {Number(attributionLead?.qualification_score || 0)}/100</span>}</div>{attributionCampaign && <p className="mt-1"><b>Campanha:</b> {attributionCampaign}</p>}{attributionAdGroup && <p><b>Grupo/conjunto:</b> {attributionAdGroup}</p>}{attributionAd && <p><b>Anúncio/criativo:</b> {attributionAd}</p>}{attributionLead?.referral_body && <p><b>Texto do anúncio:</b> {attributionLead.referral_body}</p>}{attributionLead?.utm_term && <p><b>Palavra-chave:</b> {attributionLead.utm_term}</p>}{attributionClick && <p className="break-all"><b>ID do clique:</b> {attributionClick}</p>}</div>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label><span className="label">Etapa</span><select className="input mt-1" value={leadStage} onChange={(e) => setLeadStage(e.target.value)}>{selectableStages.map((stage:any)=><option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}</select></label>
              <label><span className="label">Nome</span><input className="input mt-1" value={leadName} onChange={(e) => setLeadName(e.target.value)} /></label>
              {selectedStageIsLost && <>
                <label className="sm:col-span-2"><span className="label">Motivo da perda *</span><select className="input mt-1" value={lossReason} onChange={(e) => setLossReason(e.target.value)}><option value="">Selecione...</option>{LOSS_REASON_OPTIONS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="sm:col-span-2"><span className="label">Detalhes da perda</span><textarea className="input mt-1 min-h-20 resize-y" value={lossNotes} onChange={(e) => setLossNotes(e.target.value)} placeholder="Opcional: registre o contexto para análise comercial." /></label>
              </>}
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
