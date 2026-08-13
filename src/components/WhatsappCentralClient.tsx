'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, RefreshCw, Search, Users } from 'lucide-react';
import { WhatsappThread, type WhatsappTemplateOption } from '@/components/WhatsappThread';
import { createBrowserSupabase } from '@/lib/supabase/browser';

function titleFor(conversation: any) {
  return conversation?.clients?.name || conversation?.lead_name || conversation?.phone || 'Conversa';
}

function initials(name: string) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function shortTime(value?: string) {
  if (!value) return 'Sem mensagens';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesSearch(item: any, query: string) {
  const term = normalizeSearch(query);
  if (!term) return true;
  const haystack = normalizeSearch(`${titleFor(item)} ${item?.phone || ''} ${item?.clients?.phone || ''} ${item?.clients?.whatsapp || ''}`);
  return haystack.includes(term);
}

type WhatsappTab = 'conversas' | 'contatos';

function dedupeById(items: any[]) {
  const seen = new Set<string>();
  return (items || []).filter((item) => {
    const key = String(item?.id || item?.conversation_id || item?.client_id || item?.phone || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function WhatsappCentralClient({
  initialConversations,
  initialMessages,
  initialSelectedId,
  initialContacts = [],
  initialDraft = '',
  templates = [],
}: {
  initialConversations: any[];
  initialMessages: any[];
  initialSelectedId: string;
  initialContacts?: any[];
  initialDraft?: string;
  templates?: WhatsappTemplateOption[];
}) {
  const [conversations, setConversations] = useState(dedupeById(initialConversations || []));
  const [contacts, setContacts] = useState(dedupeById(initialContacts || []));
  const [messages, setMessages] = useState(initialMessages || []);
  const [selectedId, setSelectedId] = useState(initialSelectedId || initialConversations?.[0]?.id || '');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<WhatsappTab>(() => {
    const selected = [...(initialConversations || []), ...(initialContacts || [])].find((item: any) => item?.id === initialSelectedId);
    return selected?.contact || selected?.virtual ? 'contatos' : 'conversas';
  });
  const [draft, setDraft] = useState(initialDraft || '');
  const [loading, setLoading] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(!initialSelectedId);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const selectedIdRef = useRef(initialSelectedId || initialConversations?.[0]?.id || '');
  const queryRef = useRef('');
  const loadingRef = useRef(false);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { queryRef.current = query; }, [query]);

  const allTargets = useMemo(() => dedupeById([...(conversations || []), ...(contacts || [])]), [conversations, contacts]);

  const selected = useMemo(() => {
    if (selectedId) return allTargets.find((item: any) => item.id === selectedId || item.conversation_id === selectedId) || null;
    return conversations[0] || null;
  }, [allTargets, conversations, selectedId]);

  const filteredConversations = useMemo(() => {
    return (conversations || []).filter((conversation: any) => matchesSearch(conversation, query));
  }, [conversations, query]);

  const filteredContacts = useMemo(() => {
    return (contacts || []).filter((contact: any) => matchesSearch(contact, query));
  }, [contacts, query]);

  const conversationCount = conversations.length;
  const contactCount = contacts.length;
  const isSearching = Boolean(query.trim());

  const load = useCallback(async (targetId?: string, silent = true, searchTerm?: string) => {
    if (loadingRef.current && silent) return;
    const effectiveTargetId = typeof targetId === 'string' ? targetId : selectedIdRef.current;
    const effectiveSearch = typeof searchTerm === 'string' ? searchTerm : queryRef.current;
    if (!silent) setLoading(true);
    loadingRef.current = true;
    try {
      const params = new URLSearchParams();
      if (effectiveTargetId) params.set('conversationId', effectiveTargetId);
      // A busca é aplicada no cliente para manter a conversa atual aberta.
      // A API sempre devolve conversas reais e contatos separados.
      const cleanSearch = String(effectiveSearch || '').trim();
      params.set('_', String(Date.now()));
      const response = await fetch(`/api/whatsapp/conversations?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Erro ao carregar mensagens.');

      const nextConversations = dedupeById(result.conversations || []);
      const nextContacts = dedupeById(result.contacts || []);
      const nextSelectedId = result.selectedId || effectiveTargetId || nextConversations?.[0]?.id || '';

      setConversations(nextConversations);
      setContacts(nextContacts);
      setMessages((result.messages || []).filter((message: any) => {
        if (!nextSelectedId) return true;
        if (!message?.conversation_id) return true;
        return String(message.conversation_id) === String(nextSelectedId);
      }));

      if (nextSelectedId && nextSelectedId !== selectedIdRef.current) {
        selectedIdRef.current = nextSelectedId;
        setSelectedId(nextSelectedId);
      }
      setLastUpdate(result.fetchedAt || new Date().toISOString());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar as conversas.');
    } finally {
      loadingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('advos-whatsapp-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  useEffect(() => {
    load(selectedIdRef.current, true, queryRef.current);
    const id = window.setInterval(() => load(selectedIdRef.current, true, queryRef.current), 1300);
    const onFocus = () => load(selectedIdRef.current, true, queryRef.current);
    const onVisibility = () => {
      if (!document.hidden) load(selectedIdRef.current, true, queryRef.current);
    };
    const onForcedRefresh = () => load(selectedIdRef.current, true, queryRef.current);
    window.addEventListener('focus', onFocus);
    window.addEventListener('advos:whatsapp-refresh', onForcedRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('advos:whatsapp-refresh', onForcedRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => load(selectedIdRef.current, true, query), 250);
    return () => window.clearTimeout(id);
  }, [query, load]);

  function selectConversation(item: any) {
    const id = String(item?.id || '');
    if (!id) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    setActiveTab(item?.contact || item?.virtual ? 'contatos' : 'conversas');
    window.history.replaceState(null, '', `/app/whatsapp?conversa=${encodeURIComponent(id)}`);
    setDraft('');
    setMobileListOpen(false);
    setMessages([]);
    load(id, false, queryRef.current);
  }

  function handleThreadSent(nextConversationId?: string) {
    const target = nextConversationId || selected?.id || selectedId;
    if (target && target !== selectedIdRef.current) {
      selectedIdRef.current = target;
      setSelectedId(target);
      setActiveTab('conversas');
      window.history.replaceState(null, '', `/app/whatsapp?conversa=${encodeURIComponent(target)}`);
    }
    load(target, false, queryRef.current);
  }

  function renderListItem(item: any, kind: WhatsappTab) {
    const active = selected?.id === item.id || selected?.conversation_id === item.id;
    const title = titleFor(item);
    const isContact = kind === 'contatos' || item.contact || item.virtual;
    return (
      <button
        type="button"
        key={`${kind}-${item.id}`}
        onClick={() => selectConversation(item)}
        className={`flex w-full items-center gap-2 border-b border-[#eef1ef] px-2.5 py-2 text-left transition hover:bg-[#f5f6f6] ${active ? 'bg-[#e7f3ef]' : 'bg-white'}`}
      >
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-black text-white ${isContact ? 'bg-[#25D366]' : 'bg-[#075e54]'}`}>
          {isContact ? <Users size={14} /> : initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <b className="truncate text-[11px] text-slate-950">{title}</b>
            {!isContact && item.unread_count > 0 && <span className="badge badge-info px-1.5 py-0.5 text-[9px]">{item.unread_count}</span>}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold text-slate-500">{item.phone}</p>
            {isContact ? (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-700">contato</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-500">conversa</span>
            )}
          </div>
          {isContact ? (
            <p className="mt-0.5 text-[9px] text-emerald-700">{item.has_conversation ? 'Abrir conversa existente' : 'Contato cadastrado. Clique para iniciar.'}</p>
          ) : (
            <p className="mt-0.5 text-[9px] text-slate-400">{shortTime(item.last_message_at)}</p>
          )}
        </div>
      </button>
    );
  }

  function renderList() {
    if (isSearching) {
      const hasAny = filteredConversations.length || filteredContacts.length;
      if (!hasAny) return <p className="p-3 text-xs font-bold text-slate-500">Nenhuma conversa ou contato encontrado.</p>;
      return (
        <>
          <div className="sticky top-0 z-10 border-b border-[#eef1ef] bg-[#f8faf9] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-slate-500">Conversas com mensagens</div>
          {filteredConversations.length ? filteredConversations.map((item: any) => renderListItem(item, 'conversas')) : <p className="px-3 py-2 text-[11px] font-bold text-slate-400">Nenhuma conversa com esse nome.</p>}
          <div className="sticky top-0 z-10 border-b border-[#eef1ef] bg-[#f8faf9] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-slate-500">Contatos dos clientes</div>
          {filteredContacts.length ? filteredContacts.map((item: any) => renderListItem(item, 'contatos')) : <p className="px-3 py-2 text-[11px] font-bold text-slate-400">Nenhum cliente cadastrado com esse nome.</p>}
        </>
      );
    }

    if (activeTab === 'contatos') {
      if (!filteredContacts.length) return <p className="p-3 text-xs font-bold text-slate-500">Nenhum contato com WhatsApp cadastrado em Clientes.</p>;
      return filteredContacts.map((item: any) => renderListItem(item, 'contatos'));
    }

    if (!filteredConversations.length) return <p className="p-3 text-xs font-bold text-slate-500">Nenhuma conversa ainda. Use a aba Contatos ou a busca para iniciar com um cliente.</p>;
    return filteredConversations.map((item: any) => renderListItem(item, 'conversas'));
  }

  return (
    <div className="whatsapp-central grid h-[calc(100dvh-116px)] min-h-[540px] min-w-0 gap-3 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className={`whatsapp-panel flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#d6ddd6] bg-white shadow-sm ${mobileListOpen ? 'flex' : 'hidden xl:flex'}`}>
        <div className="shrink-0 border-b border-[#d6ddd6] bg-[#f0f2f5] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-slate-950">WhatsApp</h2>
              <p className="truncate text-[10px] text-slate-500">Conversas e contatos separados.</p>
            </div>
            <button
              type="button"
              title="Atualizar agora"
              aria-label="Atualizar agora"
              onClick={() => load(selectedId, false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d6ddd6] bg-white text-slate-600 hover:bg-[#fbf7ef]"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 rounded-full bg-[#e2e8e5] p-1 text-[10px] font-black text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('conversas')}
              className={`inline-flex items-center justify-center gap-1 rounded-full px-2 py-1.5 transition ${activeTab === 'conversas' ? 'bg-white text-[#075e54] shadow-sm' : 'hover:bg-white/50'}`}
            >
              <MessageCircle size={12} /> Conversas <span className="text-[9px] opacity-70">{conversationCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contatos')}
              className={`inline-flex items-center justify-center gap-1 rounded-full px-2 py-1.5 transition ${activeTab === 'contatos' ? 'bg-white text-[#075e54] shadow-sm' : 'hover:bg-white/50'}`}
            >
              <Users size={12} /> Contatos <span className="text-[9px] opacity-70">{contactCount}</span>
            </button>
          </div>

          <div className="field-with-icon mt-2">
            <Search size={13} className="field-with-icon__icon text-slate-400" aria-hidden="true" />
            <input
              className="input field-with-icon__input rounded-[20px] border-transparent bg-white text-[11px] shadow-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar conversa ou contato"
              aria-label="Pesquisar conversa ou contato"
            />
          </div>
        </div>

        <div className="whatsapp-list-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {renderList()}
        </div>

        <div className="shrink-0 border-t border-[#d6ddd6] bg-[#f0f2f5] px-2.5 py-1.5 text-[9px] font-bold text-slate-500">
          {error ? error : lastUpdate ? `Atualizado: ${shortTime(lastUpdate)}` : 'Aguardando atualização.'}
        </div>
      </section>

      {selected ? (
        <div className={`${mobileListOpen ? 'hidden xl:block' : 'block'} h-full min-w-0`}>
          <WhatsappThread conversation={selected} messages={messages || []} templates={templates} live={true} initialDraft={draft} onDraftApplied={() => setDraft('')} onSent={handleThreadSent} onBack={() => setMobileListOpen(true)} />
        </div>
      ) : (
        <section className="whatsapp-panel min-h-[320px] rounded-[16px] border border-[#e8dfcf] bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">
          <div className="mx-auto grid max-w-sm place-items-center gap-3 text-center">
            <MessageCircle size={34} className="text-[#075e54]" />
            <p>Selecione uma conversa com mensagens ou abra a aba Contatos para iniciar com um cliente.</p>
          </div>
        </section>
      )}
    </div>
  );
}
