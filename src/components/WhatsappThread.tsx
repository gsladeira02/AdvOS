'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, Clock3, FileText, Image as ImageIcon, Paperclip, Send, Trash2, Wifi, WifiOff, X } from 'lucide-react';
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
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

function fileSizeLabel(size?: number | null) {
  const bytes = Number(size || 0);
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function StatusTicks({ status }: { status?: string | null }) {
  const value = String(status || '').toLowerCase();
  if (value === 'failed') return <AlertTriangle size={13} className="text-red-500" aria-label="Falhou" />;
  if (value === 'read') return <CheckCheck size={15} className="text-sky-500" aria-label="Lida" />;
  if (value === 'delivered') return <CheckCheck size={15} className="text-slate-500" aria-label="Entregue" />;
  if (value === 'sent') return <Check size={14} className="text-slate-500" aria-label="Enviada" />;
  return <Clock3 size={12} className="text-slate-400" aria-label="Pendente" />;
}

function mediaKind(message: any) {
  const type = String(message?.message_type || '').toLowerCase();
  const mime = String(message?.mime_type || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/')) return 'image';
  if (type === 'video' || mime.startsWith('video/')) return 'video';
  if (type === 'audio' || mime.startsWith('audio/')) return 'audio';
  if (type === 'document' || message?.file_name || message?.storage_path) return 'document';
  return 'text';
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
  const [file, setFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    return result.slice(0, 18);
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

  async function deleteMessage(messageId: string) {
    if (!messageId || String(messageId).startsWith('local-')) {
      setItems((current) => current.filter((item: any) => item.id !== messageId));
      return;
    }
    try {
      const response = await fetch('/api/whatsapp/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível apagar.');
      setItems((current) => current.filter((item: any) => item.id !== messageId));
      setFeedback('Mensagem apagada no AdvOS.');
      onSent?.();
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao apagar mensagem.');
    }
  }

  async function clearConversation() {
    if (!conversation?.id || conversation?.virtual) return;
    const ok = window.confirm('Apagar todas as mensagens dessa conversa dentro do AdvOS? Isso não apaga no celular do cliente.');
    if (!ok) return;
    try {
      const response = await fetch('/api/whatsapp/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, scope: 'conversation' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível limpar conversa.');
      setItems([]);
      setFeedback('Conversa limpa no AdvOS.');
      onSent?.();
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao limpar conversa.');
    }
  }

  async function sendTextMessage(message: string) {
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
    return result;
  }

  async function sendFileMessage(caption: string) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    const form = new FormData();
    form.set('file', file);
    form.set('phone', conversation.phone || '');
    form.set('client_id', conversation.client_id || '');
    form.set('caption', caption || '');

    const response = await fetch('/api/whatsapp/send-media', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar arquivo.');
    return result;
  }

  async function send() {
    const message = templateMessageFromText(text);
    if ((!message && !file) || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      let result: any;
      if (file) {
        result = await sendFileMessage(message);
        const type = result.type || mediaKind({ mime_type: file.type, file_name: file.name });
        setItems((current) => [
          ...current,
          {
            id: result.externalId || `local-${Date.now()}`,
            direction: 'outbound',
            message_type: type,
            body: message || file.name,
            status: 'sent',
            created_at: new Date().toISOString(),
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          },
        ]);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        result = await sendTextMessage(message);
        setItems((current) => [
          ...current,
          {
            id: result.externalId || `local-${Date.now()}`,
            direction: 'outbound',
            message_type: 'text',
            body: message,
            status: 'sent',
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setText('');
      setShortcutOpen(false);
      setFeedback(file ? 'Arquivo enviado.' : 'Mensagem enviada.');
      onSent?.();
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar pela API oficial.');
    } finally {
      setSending(false);
    }
  }

  function renderMessageBody(message: any) {
    const kind = mediaKind(message);
    const fileName = message.file_name || message.raw_payload?.document?.filename || message.body;
    const mediaUrl = message.media_url && String(message.media_url).startsWith('http') ? String(message.media_url) : '';

    if (kind === 'image') {
      return (
        <div className="space-y-1.5">
          {mediaUrl ? <img src={mediaUrl} alt={fileName || 'Imagem'} className="max-h-64 rounded-xl object-cover" /> : <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2"><ImageIcon size={16} /> Imagem</div>}
          {message.body && <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>}
        </div>
      );
    }

    if (kind !== 'text') {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2">
            <FileText size={17} className="shrink-0" />
            <div className="min-w-0">
              <b className="block max-w-[260px] truncate text-[12px]">{fileName || 'Arquivo'}</b>
              <span className="text-[10px] font-bold text-slate-500">{kind === 'audio' ? 'Áudio' : kind === 'video' ? 'Vídeo' : 'Documento'} {fileSizeLabel(message.file_size) ? `• ${fileSizeLabel(message.file_size)}` : ''}</span>
            </div>
          </div>
          {message.body && message.body !== fileName && <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {mediaUrl && <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-700 hover:underline">Abrir arquivo</a>}
        </div>
      );
    }

    return <div className="whitespace-pre-wrap leading-relaxed">{message.body || '[mensagem sem texto]'}</div>;
  }

  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col overflow-hidden rounded-[18px] border border-[#d6ddd6] bg-[#efe7dc] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#d7ded4] bg-[#075e54] px-3 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-black">
            {title.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black">{title}</h2>
            <p className="truncate text-[10px] font-bold text-white/75">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black sm:inline-flex ${live ? 'bg-white/15 text-white' : 'bg-white/10 text-white/70'}`}>
            {live ? <Wifi size={12} /> : <WifiOff size={12} />}
            {live ? 'Ao vivo' : 'Offline'}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={clearConversation}
            title="Limpar conversa no AdvOS"
            disabled={conversation?.virtual}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(7,94,84,.08),transparent_30%),#e5ddd5] px-3 py-3">
        {!items.length && <p className="mx-auto mt-5 max-w-md rounded-xl bg-white/80 px-3 py-2 text-center text-xs font-bold text-slate-600 shadow-sm">Nenhuma mensagem nessa conversa ainda. Você já pode iniciar por aqui.</p>}
        <div className="space-y-1.5">
          {items.map((message: any) => {
            const outbound = message.direction === 'outbound';
            return (
              <div key={message.id} className={`group flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-[78%] rounded-2xl px-3 py-2 text-[12px] shadow-sm ${outbound ? 'rounded-tr-sm bg-[#dcf8c6] text-slate-900' : 'rounded-tl-sm border border-black/5 bg-white text-slate-900'}`}>
                  <button
                    type="button"
                    onClick={() => deleteMessage(message.id)}
                    className={`absolute top-1 hidden h-6 w-6 place-items-center rounded-full bg-black/10 text-slate-700 hover:bg-black/20 group-hover:grid ${outbound ? '-left-8' : '-right-8'}`}
                    title="Apagar mensagem no AdvOS"
                  >
                    <Trash2 size={12} />
                  </button>
                  {renderMessageBody(message)}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-bold text-slate-500">
                    <span>{messageTime(message.created_at)}</span>
                    {outbound && <StatusTicks status={message.status} />}
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

      <div className="border-t border-[#d7ded4] bg-[#f0f2f5] p-2.5">
        {file && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#d7ded4] bg-white px-3 py-2 text-xs shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={16} className="shrink-0 text-slate-600" />
              <div className="min-w-0">
                <b className="block truncate text-slate-900">{file.name}</b>
                <span className="text-[10px] font-bold text-slate-500">{file.type || 'arquivo'} {fileSizeLabel(file.size) ? `• ${fileSizeLabel(file.size)}` : ''}</span>
              </div>
            </div>
            <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-slate-100" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-[#fffaf2]"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar documento, imagem ou arquivo"
          >
            <Paperclip size={18} />
          </button>

          <div className="relative flex-1">
            <textarea
              className="input min-h-[44px] resize-y rounded-[20px] border-transparent bg-white px-4 py-3 text-xs shadow-sm focus:border-[#25D366]"
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
              placeholder={file ? 'Legenda opcional. Ctrl + Enter envia.' : 'Mensagem ou / para modelo. Ctrl + Enter envia.'}
            />

            {shortcutOpen && slashTerm !== null && shortcuts.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 max-h-80 w-full overflow-auto rounded-2xl border border-[#d7ded4] bg-white p-2 shadow-xl">
                <div className="mb-1 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Modelos rápidos
                </div>
                {shortcutSuggestions.length ? shortcutSuggestions.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#f0f2f5]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertTemplate(template)}
                  >
                    <span className="min-w-0">
                      <b className="block truncate text-xs text-slate-950">{template.name}</b>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">/{template.normalizedShortcut} • {template.category || 'geral'}</span>
                    </span>
                    <span className="rounded-full bg-[#e9edef] px-2 py-1 text-[10px] font-black text-slate-600">Usar</span>
                  </button>
                )) : (
                  <p className="px-2 py-3 text-xs font-bold text-slate-500">Nenhum modelo encontrado para esse atalho.</p>
                )}
              </div>
            )}
          </div>

          <button className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:bg-[#1ebe5d] disabled:cursor-not-allowed disabled:opacity-50" onClick={send} disabled={sending || (!text.trim() && !file)} title="Enviar">
            <Send size={17} />
          </button>
        </div>

        {previewTemplate && text.trim().startsWith('/') && (
          <div className="mt-2 rounded-xl border border-[#d7ded4] bg-white px-3 py-2 text-[11px] text-slate-600">
            <b>Atalho encontrado:</b> {previewTemplate.name}. Se enviar <code>/{previewTemplate.normalizedShortcut}</code>, o AdvOS substituirá pelo modelo salvo.
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shortcuts.slice(0, 10).map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-full border border-[#d7ded4] bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-[#fffaf2]"
                onClick={() => insertTemplate(template)}
                title={template.name}
              >
                /{template.normalizedShortcut}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 min-h-[16px]">
          {feedback ? (
            <p className="truncate text-[10px] font-bold text-slate-600">{feedback}</p>
          ) : (
            <p className="truncate text-[10px] text-slate-500">Digite / para listar modelos. O ícone de clipe envia documentos, imagens e arquivos.</p>
          )}
        </div>
      </div>
    </div>
  );
}
