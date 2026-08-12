'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Wifi, WifiOff } from 'lucide-react';
import { renderMessageTemplate } from '@/lib/messageTemplates';

export type WhatsappTemplateOption = {
  id: string;
  name: string;
  slug?: string;
  shortcut?: string;
  category?: string;
  body: string;
};

type NormalizedTemplate = WhatsappTemplateOption & { normalizedShortcut: string };

function messageTime(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function normalizeShortcut(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function firstName(name?: string | null) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function WhatsappThread({
  conversation,
  messages,
  templates = [],
  live = true,
  onSent,
}: {
  conversation: any;
  messages: any[];
  templates?: WhatsappTemplateOption[];
  live?: boolean;
  onSent?: () => void;
}) {
  const [text, setText] = useState('');
  const [items, setItems] = useState(messages || []);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(messages || []);
  }, [messages, conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length, conversation?.id]);

  const title = useMemo(() => {
    return conversation?.clients?.name || conversation?.lead_name || conversation?.phone || 'Conversa';
  }, [conversation]);

  const shortcuts = useMemo(() => {
    return (templates || [])
      .map((template) => {
        const shortcut = normalizeShortcut(template.shortcut || template.slug || template.name);
        return shortcut ? { ...template, normalizedShortcut: shortcut } : null;
      })
      .filter(Boolean) as NormalizedTemplate[];
  }, [templates]);

  function renderTemplate(template: WhatsappTemplateOption) {
    const clientName = conversation?.clients?.name || conversation?.lead_name || '';
    return renderMessageTemplate(template.body, {
      cliente: clientName,
      primeiro_nome: firstName(clientName),
      telefone_escritorio: '',
      escritorio: 'escritório',
    });
  }

  function templateMessageFromText(raw: string) {
    const typed = raw.trim();
    if (!typed.startsWith('/')) return raw.trim();

    const key = normalizeShortcut(typed.slice(1).split(/\s+/)[0]);
    const template = shortcuts.find((item) => item.normalizedShortcut === key);
    if (!template) return raw.trim();

    return renderTemplate(template);
  }

  const slashTerm = useMemo(() => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('/')) return null;
    return normalizeSearch(trimmed.slice(1).split(/\s+/)[0] || '');
  }, [text]);

  const shortcutSuggestions = useMemo(() => {
    if (slashTerm === null) return [];
    const term = slashTerm;
    const result = shortcuts.filter((template) => {
      if (!term) return true;
      const haystack = normalizeSearch(`${template.normalizedShortcut} ${template.name} ${template.category || ''}`);
      return haystack.includes(term);
    });
    return result.slice(0, 12);
  }, [shortcuts, slashTerm]);

  const previewTemplate = useMemo(() => {
    const typed = text.trim();
    if (!typed.startsWith('/')) return null;
    const key = normalizeShortcut(typed.slice(1).split(/\s+/)[0]);
    return shortcuts.find((item) => item.normalizedShortcut === key) || null;
  }, [text, shortcuts]);

  function insertTemplate(template: NormalizedTemplate) {
    setText(renderTemplate(template));
    setShortcutOpen(false);
    setFeedback(`Modelo inserido: ${template.name}.`);
  }

  async function send() {
    const message = templateMessageFromText(text);
    if (!message || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: conversation.phone,
          client_id: conversation.client_id,
          message,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar.');
      setItems((current) => [
        ...current,
        {
          id: result.externalId || `local-${Date.now()}`,
          direction: 'outbound',
          body: message,
          status: 'sent',
          created_at: new Date().toISOString(),
        },
      ]);
      setText('');
      setShortcutOpen(false);
      setFeedback('Mensagem enviada.');
      onSent?.();
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar pela API oficial.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col overflow-hidden rounded-[16px] border border-[#e8dfcf] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#eee4d4] bg-[#fbf7ef] px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-slate-950">{title}</h2>
          <p className="truncate text-[10px] font-bold text-slate-500">{conversation.phone}</p>
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${live ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {live ? <Wifi size={12} /> : <WifiOff size={12} />}
          {live ? 'Atualizando' : 'Offline'}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#fffdf8] px-3 py-3">
        {!items.length && <p className="text-xs font-bold text-slate-500">Nenhuma mensagem nessa conversa ainda. Você já pode iniciar por aqui.</p>}
        <div className="space-y-2">
          {items.map((message: any) => {
            const outbound = message.direction === 'outbound';
            return (
              <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[76%] rounded-2xl px-3 py-2 text-[12px] shadow-sm ${outbound ? 'bg-[#dcf8c6] text-slate-900' : 'bg-white text-slate-900 border border-[#eee4d4]'}`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{message.body || '[mensagem sem texto]'}</div>
                  <div className="mt-1 text-[8px] font-bold uppercase tracking-wide text-slate-500">
                    {message.status || (outbound ? 'enviada' : 'recebida')} • {messageTime(message.created_at)}
                  </div>
                  {message.status === 'failed' && (
                    <div className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[9px] font-bold normal-case text-red-700">
                      Falhou: {message.error_message || 'em primeira mensagem ou fora da janela de 24h, a Meta exige template oficial aprovado.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[#eee4d4] bg-[#fbf7ef] p-2.5">
        <div className="relative">
          <textarea
            className="input min-h-[68px] resize-y rounded-xl text-xs"
            value={text}
            onChange={(event) => {
              const value = event.target.value;
              setText(value);
              setShortcutOpen(value.trimStart().startsWith('/'));
            }}
            onFocus={() => setShortcutOpen(text.trimStart().startsWith('/'))}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                send();
              }
              if (event.key === 'Escape') setShortcutOpen(false);
            }}
            placeholder="Digite a mensagem ou / para escolher um modelo. Ctrl + Enter envia."
          />

          {shortcutOpen && slashTerm !== null && shortcuts.length > 0 && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 max-h-72 w-full overflow-auto rounded-2xl border border-[#e8dfcf] bg-white p-2 shadow-xl">
              <div className="mb-1 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                Modelos rápidos
              </div>
              {shortcutSuggestions.length ? shortcutSuggestions.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#fbf7ef]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertTemplate(template)}
                >
                  <span className="min-w-0">
                    <b className="block truncate text-xs text-slate-950">{template.name}</b>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">/{template.normalizedShortcut} • {template.category || 'geral'}</span>
                  </span>
                  <span className="rounded-full bg-[#fbf7ef] px-2 py-1 text-[10px] font-black text-slate-600">Selecionar</span>
                </button>
              )) : (
                <p className="px-2 py-3 text-xs font-bold text-slate-500">Nenhum modelo encontrado para esse atalho.</p>
              )}
            </div>
          )}
        </div>

        {previewTemplate && text.trim().startsWith('/') && (
          <div className="mt-2 rounded-xl border border-[#eee4d4] bg-white px-3 py-2 text-[11px] text-slate-600">
            <b>Atalho encontrado:</b> {previewTemplate.name}. Se enviar <code>/{previewTemplate.normalizedShortcut}</code>, o AdvOS substituirá pelo modelo salvo.
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shortcuts.slice(0, 8).map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-full border border-[#eee4d4] bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-[#fffaf2]"
                onClick={() => insertTemplate(template)}
                title={template.name}
              >
                /{template.normalizedShortcut}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {feedback ? (
              <p className="truncate text-[10px] font-bold text-slate-600">{feedback}</p>
            ) : (
              <p className="truncate text-[10px] text-slate-500">Digite / para listar modelos. Enter quebra linha. Ctrl + Enter envia.</p>
            )}
          </div>
          <button className="btn btn-primary shrink-0 !rounded-lg !px-3 !py-2 text-xs" onClick={send} disabled={sending || !text.trim()}>
            <Send size={13} />
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
