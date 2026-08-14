'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, History, MessageSquareText, Trash2, UserCheck, Users, X } from 'lucide-react';

function formatDate(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function userName(user: any) {
  return String(user?.full_name || user?.email || 'Usuário');
}

export function WhatsappOperationsPanel({
  conversation,
  teamUsers = [],
  currentUserId = '',
  canConfigure = false,
  onChanged,
}: {
  conversation: any;
  teamUsers?: any[];
  currentUserId?: string;
  canConfigure?: boolean;
  onChanged?: (change?: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [panel, setPanel] = useState<'notes' | 'history' | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [contextLoading, setContextLoading] = useState(false);
  const [assigneeValue, setAssigneeValue] = useState(String(conversation?.assigned_to || ''));

  const activeUsers = useMemo(() => (teamUsers || []).filter((user: any) => user?.status === 'ativo' && user?.auth_user_id), [teamUsers]);
  const assignedTo = assigneeValue;
  const assignedUser = conversation?.assigned_user || (teamUsers || []).find((user: any) => String(user?.auth_user_id || '') === assignedTo) || null;

  useEffect(() => {
    setFeedback(null);
    setPanel(null);
    setNotes([]);
    setEvents([]);
    setNoteText('');
    setAssigneeValue(String(conversation?.assigned_to || ''));
  }, [conversation?.id, conversation?.assigned_to]);

  async function manage(payload: Record<string, any>) {
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/conversations/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ conversationId: conversation?.id, ...payload }),
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

  async function loadContext(nextPanel?: 'notes' | 'history') {
    if (!conversation?.id || conversation?.virtual) return;
    setContextLoading(true); setFeedback(null);
    try {
      const response = await fetch(`/api/whatsapp/conversations/context?conversationId=${encodeURIComponent(String(conversation.id))}&_=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível carregar o histórico.');
      setNotes(result.notes || []);
      setEvents(result.events || []);
      if (nextPanel) setPanel(nextPanel);
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível carregar notas e histórico.');
    } finally { setContextLoading(false); }
  }

  async function setAssignee(value: string) {
    const previous = assigneeValue;
    setAssigneeValue(value);
    const result = await manage({ action: 'set_assignee', assigneeId: value || null });
    if (result) setFeedback(value ? 'Responsável atualizado.' : 'Conversa ficou sem responsável.');
    else setAssigneeValue(previous);
  }

  async function assumeForMe() {
    if (!currentUserId) return;
    await setAssignee(currentUserId);
  }

  async function addNote() {
    const body = noteText.trim();
    if (!body) return;
    const result = await manage({ action: 'add_internal_note', note: body });
    if (result?.note) {
      setNoteText('');
      setNotes((current) => [result.note, ...current]);
      setFeedback('Nota interna adicionada. Ela não é enviada ao cliente.');
      void loadContext();
    }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm('Excluir esta nota interna?')) return;
    const result = await manage({ action: 'delete_internal_note', noteId });
    if (result?.ok) {
      setNotes((current) => current.filter((note: any) => String(note.id) !== String(noteId)));
      void loadContext();
    }
  }

  if (conversation?.virtual) return null;

  return (
    <>
      <div className="whatsapp-operations-row mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400"><UserCheck size={10}/>Responsável</span>
        <select
          value={assignedTo}
          disabled={busy}
          onChange={(event) => void setAssignee(event.target.value)}
          className="max-w-[210px] rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-700 outline-none"
          title="Responsável pela conversa"
        >
          <option value="">Sem responsável</option>
          {activeUsers.map((user: any) => <option key={user.auth_user_id} value={user.auth_user_id}>{userName(user)}</option>)}
        </select>
        {assignedTo !== currentUserId && currentUserId && <button type="button" disabled={busy} onClick={() => void assumeForMe()} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Assumir para mim</button>}
        {assignedUser && <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600" title={userName(assignedUser)}>{userName(assignedUser)}</span>}
        <button type="button" onClick={() => void loadContext('notes')} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-800 hover:bg-amber-100"><MessageSquareText size={10}/>Notas internas</button>
        <button type="button" onClick={() => void loadContext('history')} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black text-slate-600 hover:bg-slate-50"><History size={10}/>Histórico</button>
        {feedback && <span className="min-w-0 break-safe text-[9px] font-bold text-slate-500">{feedback}</span>}
      </div>

      {panel && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-950">{panel === 'notes' ? <MessageSquareText size={15}/> : <ClipboardList size={15}/>} {panel === 'notes' ? 'Notas internas' : 'Histórico do atendimento'}</h3>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{panel === 'notes' ? 'Visíveis apenas dentro do AdvOS. Nunca são enviadas ao WhatsApp.' : 'Movimentações registradas nesta conversa.'}</p>
              </div>
              <button type="button" onClick={() => setPanel(null)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15}/></button>
            </div>

            {panel === 'notes' && (
              <div className="shrink-0 border-b border-amber-100 bg-amber-50/60 p-3">
                <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} className="input min-h-24 resize-y bg-white" maxLength={5000} placeholder="Ex.: cliente informou que enviará os documentos amanhã. Esta nota não será enviada ao WhatsApp." />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold text-amber-800">{noteText.length}/5000</span>
                  <button type="button" disabled={busy || !noteText.trim()} onClick={() => void addNote()} className="btn px-3 py-2 text-xs">Adicionar nota</button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {contextLoading && <p className="p-4 text-center text-xs font-bold text-slate-500">Carregando...</p>}
              {!contextLoading && panel === 'notes' && !notes.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">Nenhuma nota interna nesta conversa.</p>}
              {!contextLoading && panel === 'notes' && <div className="space-y-2">{notes.map((note: any) => {
                const canDelete = canConfigure || String(note?.author_id || '') === String(currentUserId || '');
                return <article key={note.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-[10px] text-amber-950">{userName(note.author)}</b><span className="text-[9px] font-bold text-amber-700/70">{formatDate(note.created_at)}</span></div>{canDelete && <button type="button" disabled={busy} onClick={() => void deleteNote(String(note.id))} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-amber-800 hover:bg-amber-100" title="Excluir nota"><Trash2 size={12}/></button>}</div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-relaxed text-slate-800">{note.body}</p>
                </article>;
              })}</div>}

              {!contextLoading && panel === 'history' && !events.length && <p className="rounded-xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">Nenhuma movimentação registrada ainda.</p>}
              {!contextLoading && panel === 'history' && <div className="space-y-2">{events.map((event: any) => <article key={event.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-sm"><Users size={13}/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><b className="text-[10px] text-slate-900">{userName(event.actor)}</b><span className="text-[9px] font-bold text-slate-400">{formatDate(event.created_at)}</span></div><p className="mt-0.5 break-words text-[11px] font-semibold text-slate-600">{event.description || event.event_type}</p></div></article>)}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
