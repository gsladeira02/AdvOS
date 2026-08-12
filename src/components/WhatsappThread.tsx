'use client';

import { useState } from 'react';

export function WhatsappThread({
  conversation,
  messages,
}: {
  conversation: any;
  messages: any[];
}) {
  const [text, setText] = useState('');
  const [items, setItems] = useState(messages || []);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function send() {
    const message = text.trim();
    if (!message) return;
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
      setFeedback('Enviado pela API oficial.');
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar pela API oficial.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[#eee4d4] bg-[#fbf7ef] p-4">
        <h2 className="text-lg font-black text-slate-950">{conversation.clients?.name || conversation.lead_name || conversation.phone}</h2>
        <p className="text-xs font-bold text-slate-500">{conversation.phone}</p>
      </div>

      <div className="h-[440px] overflow-auto bg-white p-4">
        {!items.length && <p className="text-sm font-bold text-slate-500">Nenhuma mensagem nessa conversa ainda.</p>}
        <div className="space-y-3">
          {items.map((message: any) => {
            const outbound = message.direction === 'outbound';
            return (
              <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${outbound ? 'bg-[#daf8cb] text-slate-900' : 'bg-[#f4efe4] text-slate-900'}`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{message.body || '[mensagem sem texto]'}</div>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {message.status || (outbound ? 'enviada' : 'recebida')} • {message.created_at ? new Date(message.created_at).toLocaleString('pt-BR') : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#eee4d4] bg-[#fbf7ef] p-4">
        <textarea
          className="input min-h-[92px] resize-y"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Digite a mensagem para enviar pela API oficial do WhatsApp..."
        />
        {feedback && <p className="mt-2 text-xs font-bold text-slate-600">{feedback}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">Mensagens livres funcionam dentro da janela de atendimento de 24h. Fora dela, use templates oficiais aprovados na Meta.</p>
          <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()}>
            {sending ? 'Enviando...' : 'Enviar pela API'}
          </button>
        </div>
      </div>
    </div>
  );
}
