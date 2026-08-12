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

  const load = useCallback(async (targetId = selectedId, silent = true) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetId) params.set('conversationId', targetId);
      const response = await fetch(`/api/whatsapp/conversations${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Erro ao carregar mensagens.');
      setConversations(result.conversations || []);
      setMessages(result.messages || []);
      setSelectedId(result.selectedId || targetId || result.conversations?.[0]?.id || '');
      setLastUpdate(result.fetchedAt || new Date().toISOString());
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar as conversas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedId]);


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
    const id = window.setInterval(() => load(selectedId, true), 1800);
    const onFocus = () => load(selectedId, true);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, selectedId]);

  function selectConversation(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, '', `/app/whatsapp?conversa=${id}`);
    load(id, false);
  }

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-3 xl:grid-cols-[260px_1fr]">
      <section className="overflow-hidden rounded-[16px] border border-[#e8dfcf] bg-white shadow-sm">
        <div className="border-b border-[#eee4d4] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-black text-slate-950">Conversas</h2>
              <p className="text-[10px] text-slate-500">Clientes + mensagens recebidas.</p>
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
              className="input rounded-xl py-1.5 pl-8 pr-2 text-[11px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nome ou número"
            />
          </div>
        </div>

        <div className="max-h-[calc(100vh-246px)] overflow-auto">
          {!filtered.length && <p className="p-3 text-xs font-bold text-slate-500">Nenhuma conversa encontrada.</p>}
          {filtered.map((conversation: any) => {
            const active = selected?.id === conversation.id;
            const title = titleFor(conversation);
            return (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`flex w-full items-center gap-2 border-b border-[#f0e7d8] px-2.5 py-2 text-left transition hover:bg-[#fffaf2] ${active ? 'bg-[#fbf7ef]' : 'bg-white'}`}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                  {initials(title)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-[11px] text-slate-950">{title}</b>
                    {conversation.unread_count > 0 && <span className="badge badge-info px-1.5 py-0.5 text-[9px]">{conversation.unread_count}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-bold text-slate-500">{conversation.phone}</p>
                    {conversation.virtual && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-500">cliente</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-400">{shortTime(conversation.last_message_at)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#eee4d4] bg-[#fbf7ef] px-2.5 py-1.5 text-[9px] font-bold text-slate-500">
          {error ? error : lastUpdate ? `Atualizado: ${shortTime(lastUpdate)}` : 'Aguardando atualização.'}
        </div>
      </section>

      {selected ? (
        <WhatsappThread conversation={selected} messages={messages || []} templates={templates} live={!error} onSent={() => load(selected.id, true)} />
      ) : (
        <section className="rounded-[16px] border border-[#e8dfcf] bg-white p-8 text-sm font-bold text-slate-500 shadow-sm">
          Selecione uma conversa ou aguarde a primeira mensagem recebida via webhook.
        </section>
      )}
    </div>
  );
}
