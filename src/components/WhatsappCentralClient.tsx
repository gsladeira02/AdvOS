'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
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

export function WhatsappCentralClient({
  initialConversations,
  initialMessages,
  initialSelectedId,
  templates = [],
}: {
  initialConversations: any[];
  initialMessages: any[];
  initialSelectedId: string;
  templates?: WhatsappTemplateOption[];
}) {
  const [conversations, setConversations] = useState(initialConversations || []);
  const [messages, setMessages] = useState(initialMessages || []);
  const [selectedId, setSelectedId] = useState(initialSelectedId || initialConversations?.[0]?.id || '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const selected = useMemo(() => {
    return conversations.find((item: any) => item.id === selectedId) || conversations[0] || null;
  }, [conversations, selectedId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation: any) => {
      const title = titleFor(conversation).toLowerCase();
      const phone = String(conversation.phone || '').toLowerCase();
      return title.includes(term) || phone.includes(term);
    });
  }, [conversations, query]);

  const load = useCallback(async (targetId = selectedId, silent = true, searchTerm = query) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetId) params.set('conversationId', targetId);
      const cleanSearch = String(searchTerm || '').trim();
      if (cleanSearch) params.set('q', cleanSearch);
      const response = await fetch(`/api/whatsapp/conversations${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Erro ao carregar mensagens.');
      const nextSelectedId = result.selectedId || targetId || result.conversations?.[0]?.id || '';
      setConversations(result.conversations || []);
      setMessages((result.messages || []).filter((message: any) => !nextSelectedId || !message?.conversation_id || message.conversation_id === nextSelectedId));
      setSelectedId(nextSelectedId);
      setLastUpdate(result.fetchedAt || new Date().toISOString());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar as conversas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedId, query]);


  useEffect(() => {
    const channel = supabase
      .channel(`advos-whatsapp-${selectedId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => load(selectedId, true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => load(selectedId, true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedId, load]);

  useEffect(() => {
    const id = window.setInterval(() => load(selectedId, true, query), 1800);
    const onFocus = () => load(selectedId, true, query);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, selectedId, query]);

  useEffect(() => {
    const id = window.setTimeout(() => load(selectedId, true, query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  function selectConversation(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, '', `/app/whatsapp?conversa=${id}`);
    setMessages([]);
    load(id, false, query);
  }

  function handleThreadSent(nextConversationId?: string) {
    const target = nextConversationId || selected?.id || selectedId;
    if (target && target !== selectedId) {
      setSelectedId(target);
      window.history.replaceState(null, '', `/app/whatsapp?conversa=${target}`);
    }
    load(target, true, query);
  }

  return (
    <div className="grid h-[calc(100vh-116px)] min-h-[540px] gap-3 xl:grid-cols-[300px_1fr]">
      <section className="overflow-hidden rounded-[18px] border border-[#d6ddd6] bg-white shadow-sm">
        <div className="border-b border-[#d6ddd6] bg-[#f0f2f5] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-950">Conversas</h2>
              <p className="text-[10px] text-slate-500">Clientes cadastrados aparecem como contatos.</p>
            </div>
            <button
              type="button"
              title="Atualizar agora"
              aria-label="Atualizar agora"
              onClick={() => load(selectedId, false)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[#eee4d4] text-slate-600 hover:bg-[#fbf7ef]"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="relative mt-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input rounded-[20px] border-transparent bg-white py-2 pl-8 pr-2 text-[11px] shadow-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar ou começar conversa"
            />
          </div>
        </div>

        <div className="max-h-[calc(100vh-230px)] overflow-y-auto">
          {!filtered.length && <p className="p-3 text-xs font-bold text-slate-500">Nenhuma conversa encontrada.</p>}
          {filtered.map((conversation: any) => {
            const active = selected?.id === conversation.id;
            const title = titleFor(conversation);
            return (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full items-center gap-2 border-b border-[#eef1ef] px-2.5 py-2 text-left transition hover:bg-[#f5f6f6] ${active ? 'bg-[#f0f2f5]' : 'bg-white'}`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#075e54] text-[10px] font-black text-white">
                  {initials(title)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-[11px] text-slate-950">{title}</b>
                    {conversation.unread_count > 0 && <span className="badge badge-info px-1.5 py-0.5 text-[9px]">{conversation.unread_count}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-bold text-slate-500">{conversation.phone}</p>
                    {conversation.virtual && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-700">contato</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-400">{shortTime(conversation.last_message_at)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#d6ddd6] bg-[#f0f2f5] px-2.5 py-1.5 text-[9px] font-bold text-slate-500">
          {error ? error : lastUpdate ? `Atualizado: ${shortTime(lastUpdate)}` : 'Aguardando atualização.'}
        </div>
      </section>

      {selected ? (
        <WhatsappThread key={selected.id} conversation={selected} messages={messages || []} templates={templates} live={!error} onSent={handleThreadSent} />
      ) : (
        <section className="rounded-[16px] border border-[#e8dfcf] bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">
          Selecione uma conversa ou aguarde a primeira mensagem recebida via webhook.
        </section>
      )}
    </div>
  );
}
