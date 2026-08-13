'use client';

import { useMemo, useState } from 'react';
import { Tag, UserPlus, X } from 'lucide-react';

const LEAD_STAGES = [
  ['novo', 'Novo'],
  ['em_atendimento', 'Em atendimento'],
  ['qualificado', 'Qualificado'],
  ['proposta', 'Proposta'],
  ['aguardando', 'Aguardando'],
  ['perdido', 'Perdido'],
] as const;

function departmentLabel(value?: string | null) {
  return value === 'financeiro_juridico' ? 'Financeiro/Jurídico' : 'Atendimento';
}

function stageLabel(value?: string | null) {
  return LEAD_STAGES.find(([key]) => key === value)?.[1] || (value === 'convertido' ? 'Convertido' : 'Novo');
}

export function WhatsappConversationControls({ conversation, onChanged }: { conversation: any; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
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

  const tags = useMemo(() => Array.isArray(conversation?.tags) ? conversation.tags.filter(Boolean) : [], [conversation?.tags]);
  const isClient = Boolean(conversation?.client_id || conversation?.clients?.id);
  const isLead = Boolean(!isClient && conversation?.lead);
  const department = conversation?.department || 'atendimento';

  async function action(payload: Record<string, any>) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/conversations/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ conversationId: conversation?.id, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível atualizar a conversa.');
      onChanged?.();
      return result;
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível atualizar a conversa.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    const result = await action({ action: 'add_tag', tag });
    if (result) setTagInput('');
  }

  function openLeadDetails() {
    setLeadName(conversation?.lead?.name || conversation?.lead_name || '');
    setLeadEmail(conversation?.lead?.email || '');
    setLeadService(conversation?.lead?.service_interest || '');
    setLeadNotes(conversation?.lead?.notes || '');
    setLeadStage(conversation?.lead?.stage || 'novo');
    setLeadModal(true);
  }

  async function saveLeadDetails() {
    const result = await action({
      action: 'update_lead',
      stage: leadStage,
      name: leadName,
      email: leadEmail,
      serviceInterest: leadService,
      notes: leadNotes,
    });
    if (result) {
      setLeadModal(false);
      setFeedback('Lead atualizado.');
    }
  }

  function openClientRegistration() {
    setClientName(conversation?.lead?.name || conversation?.lead_name || '');
    setClientEmail(conversation?.lead?.email || '');
    setClientDoc('');
    setClientNotes(conversation?.lead?.notes || '');
    setClientModal(true);
  }

  async function convertToClient() {
    if (!clientName.trim()) {
      setFeedback('Informe o nome do cliente.');
      return;
    }
    const result = await action({
      action: 'convert_to_client',
      name: clientName,
      email: clientEmail,
      doc: clientDoc,
      notes: clientNotes,
    });
    if (result) {
      setClientModal(false);
      setFeedback(result.created ? 'Cliente cadastrado e conversa vinculada.' : 'Cliente existente vinculado à conversa.');
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-[#d7ded4] bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${department === 'financeiro_juridico' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {departmentLabel(department)}
          </span>

          <button
            type="button"
            disabled={busy || conversation?.virtual}
            onClick={() => action({ action: 'set_department', department: department === 'atendimento' ? 'financeiro_juridico' : 'atendimento' })}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Transferir para {department === 'atendimento' ? 'Financeiro/Jurídico' : 'Atendimento'}
          </button>

          {isLead && (
            <select
              value={conversation?.lead?.stage || 'novo'}
              disabled={busy}
              onChange={(event) => action({ action: 'update_lead', stage: event.target.value })}
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800 outline-none"
              title="Etapa do lead"
            >
              {LEAD_STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}

          {isLead && (
            <button type="button" disabled={busy} onClick={openLeadDetails} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[9px] font-black text-amber-800 hover:bg-amber-50 disabled:opacity-50">
              Detalhes do lead
            </button>
          )}

          {isLead && (
            <button type="button" disabled={busy} onClick={openClientRegistration} className="inline-flex items-center gap-1 rounded-full bg-[#075e54] px-2.5 py-1 text-[9px] font-black text-white hover:bg-[#064e47] disabled:opacity-50">
              <UserPlus size={11} /> Cadastrar como cliente
            </button>
          )}

          {isClient && (
            <a href={`/app/clientes/${encodeURIComponent(String(conversation?.client_id || conversation?.clients?.id))}`} className="rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black text-sky-700 hover:bg-sky-100">
              Abrir Pasta do Cliente
            </a>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag: string) => (
            <span key={tag} className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-700">
              <Tag size={10} className="shrink-0" /> <span className="truncate">{tag}</span>
              <button type="button" disabled={busy} onClick={() => action({ action: 'remove_tag', tag })} className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full hover:bg-slate-200" title={`Remover tag ${tag}`}><X size={9} /></button>
            </span>
          ))}
          {!conversation?.virtual && tags.length < 12 && (
            <div className="flex items-center rounded-full border border-slate-200 bg-white pl-2">
              <Tag size={10} className="text-slate-400" />
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void addTag(); }
                }}
                placeholder="Adicionar tag"
                maxLength={28}
                className="w-24 bg-transparent px-1.5 py-1 text-[9px] font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button type="button" disabled={busy || !tagInput.trim()} onClick={addTag} className="px-2 py-1 text-[9px] font-black text-[#075e54] disabled:opacity-40">+</button>
            </div>
          )}
        </div>

        {isLead && <p className="mt-1.5 text-[9px] font-bold text-amber-700">Lead: {stageLabel(conversation?.lead?.stage)} · só vira cliente após confirmação manual.</p>}
        {feedback && <p className="mt-1.5 text-[9px] font-bold text-slate-600">{feedback}</p>}
      </div>

      {leadModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeadModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-950">Detalhes do lead</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Qualifique o contato sem transformá-lo em cliente.</p>
              </div>
              <button type="button" onClick={() => setLeadModal(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15} /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label><span className="label">Etapa</span><select className="input mt-1" value={leadStage} onChange={(e) => setLeadStage(e.target.value)}>{LEAD_STAGES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span className="label">Nome</span><input className="input mt-1" value={leadName} onChange={(e) => setLeadName(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">E-mail</span><input type="email" className="input mt-1" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">Interesse / área jurídica</span><input className="input mt-1" value={leadService} onChange={(e) => setLeadService(e.target.value)} placeholder="Ex.: Trabalhista, Família, Empresarial..." /></label>
              <label className="sm:col-span-2"><span className="label">Observações</span><textarea className="input mt-1 min-h-28 resize-y" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} /></label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setLeadModal(false)} className="btn btn-secondary">Cancelar</button>
              <button type="button" disabled={busy} onClick={saveLeadDetails} className="btn">{busy ? 'Salvando...' : 'Salvar lead'}</button>
            </div>
          </div>
        </div>
      )}

      {clientModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setClientModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-950">Cadastrar como cliente</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Revise os dados. Nada é cadastrado automaticamente.</p>
              </div>
              <button type="button" onClick={() => setClientModal(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15} /></button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="label">Nome *</span><input className="input mt-1" value={clientName} onChange={(e) => setClientName(e.target.value)} /></label>
              <label><span className="label">WhatsApp</span><input className="input mt-1 bg-slate-50" value={conversation?.phone || ''} readOnly /></label>
              <label><span className="label">CPF/CNPJ</span><input className="input mt-1" value={clientDoc} onChange={(e) => setClientDoc(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">E-mail</span><input className="input mt-1" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></label>
              <label className="sm:col-span-2"><span className="label">Observações</span><textarea className="input mt-1 min-h-24 resize-y" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} /></label>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setClientModal(false)} className="btn btn-secondary">Cancelar</button>
              <button type="button" disabled={busy || !clientName.trim()} onClick={convertToClient} className="btn">{busy ? 'Salvando...' : 'Cadastrar como cliente'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
