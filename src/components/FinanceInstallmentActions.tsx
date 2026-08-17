'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { PAYMENT_METHOD_OPTIONS } from '@/lib/finance';

export function FinanceInstallmentActions({
  installmentId,
  paymentMethod,
  billingType,
  onUpdated,
  onDeleted,
  compact = false,
}: {
  installmentId: string;
  paymentMethod?: string | null;
  billingType?: string | null;
  onUpdated?: (paymentMethod: string) => void;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const inferred = paymentMethod || (String(billingType || '').toUpperCase() === 'PIX' ? 'pix' : String(billingType || '').toUpperCase() === 'BOLETO' ? 'boleto' : String(billingType || '').toUpperCase() === 'CREDIT_CARD' ? 'cartao_credito' : String(billingType || '').toUpperCase() === 'UNDEFINED' ? 'cliente_escolhe' : '');
  const [method, setMethod] = useState(inferred);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveMethod(next: string) {
    const previous = method;
    setMethod(next);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/finance/installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId, action: 'update', paymentMethod: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível salvar a forma de pagamento.');
      onUpdated?.(next);
    } catch (e: any) {
      setMethod(previous);
      setError(e?.message || 'Não foi possível salvar a forma de pagamento.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    const confirmed = window.confirm('Excluir esta cobrança? Ela será removida do Financeiro e da ficha do cliente. Esta ação não cancela automaticamente uma cobrança já criada no Asaas.');
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/finance/installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId, action: 'delete' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível excluir a cobrança.');
      onDeleted?.();
      if (!onDeleted) window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'Não foi possível excluir a cobrança.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'space-y-1.5'}>
      <select
        className={compact ? 'input compact-input !h-8 !min-h-0 min-w-[150px] !py-1 text-[11px]' : 'input compact-input'}
        value={method}
        disabled={busy}
        onChange={(event) => void saveMethod(event.target.value)}
        title="Forma de pagamento"
      >
        {PAYMENT_METHOD_OPTIONS.map(([value, label]) => <option key={value || 'none'} value={value}>{label}</option>)}
      </select>
      <button
        type="button"
        className={compact ? 'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50' : 'btn btn-ghost !border-red-200 !text-red-700'}
        onClick={() => void remove()}
        disabled={busy}
        title="Excluir cobrança"
      >
        <Trash2 size={14} />{!compact && <span>Excluir cobrança</span>}
      </button>
      {error && <span className="text-[10px] font-bold text-red-700">{error}</span>}
    </div>
  );
}
