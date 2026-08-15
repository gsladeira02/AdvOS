'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';

export default function SendWhatsAppApiButton({
  phone,
  message,
  clientId,
  requiredLink,
  generatedContractId,
}: {
  phone: string;
  message: string;
  clientId?: string | null;
  requiredLink?: string | null;
  generatedContractId?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setSent(false);
    setError('');
    try {
      let resolvedMessage = message;
      if (generatedContractId) {
        const ensure = await fetch('/api/signatures/ensure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ generatedContractId }),
        });
        const ensureData = await ensure.json().catch(() => ({}));
        if (!ensure.ok || !ensureData?.ok || !ensureData?.signatureUrl) {
          throw new Error(ensureData?.error || 'Não foi possível criar o link de assinatura.');
        }
        resolvedMessage = resolvedMessage.replace(/https?:\/\/[^\s]+/g, ensureData.signatureUrl);
        if (!resolvedMessage.includes(ensureData.signatureUrl)) {
          resolvedMessage += `\n\nAcesse o link seguro para visualizar e assinar:\n${ensureData.signatureUrl}`;
        }
      } else if (requiredLink !== undefined && !String(requiredLink || '').trim()) {
        throw new Error('O link de assinatura não foi encontrado.');
      }
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ phone, message: resolvedMessage, clientId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Não foi possível enviar pela API oficial do WhatsApp.');
      }
      setSent(true);
    } catch (e: any) {
      setError(String(e?.message || 'Não foi possível enviar pela API oficial do WhatsApp.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !phone || !message}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : sent ? <CheckCircle2 size={15} /> : <Send size={15} />}
        {busy ? 'Enviando pela API…' : sent ? 'Enviado pela API' : 'Enviar pelo WhatsApp'}
      </button>
      {sent && <span className="text-[11px] font-bold text-emerald-700">Mensagem enviada diretamente pelo AdvOS.</span>}
      {error && <span className="max-w-[320px] text-[11px] font-semibold leading-snug text-red-700">{error}</span>}
    </div>
  );
}
