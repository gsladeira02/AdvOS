export const PAYMENT_METHOD_OPTIONS = [
  ['', 'Não definido'],
  ['pix', 'Pix'],
  ['boleto', 'Boleto'],
  ['cartao_credito', 'Cartão de crédito'],
  ['cartao_debito', 'Cartão de débito'],
  ['transferencia', 'Transferência'],
  ['dinheiro', 'Dinheiro'],
  ['cliente_escolhe', 'Cliente escolhe'],
  ['outro', 'Outro'],
] as const;

export function paymentMethodLabel(value?: string | null, billingType?: string | null) {
  const raw = String(value || '').trim();
  const found = PAYMENT_METHOD_OPTIONS.find(([key]) => key === raw);
  if (found) return found[1];
  const billing = String(billingType || '').toUpperCase();
  if (billing === 'PIX') return 'Pix';
  if (billing === 'BOLETO') return 'Boleto';
  if (billing === 'CREDIT_CARD') return 'Cartão de crédito';
  if (billing === 'UNDEFINED') return 'Cliente escolhe';
  return 'Não definido';
}


export function paymentMethodFromBillingType(value?: string | null) {
  const billing = String(value || '').toUpperCase();
  if (billing === 'PIX') return 'pix';
  if (billing === 'BOLETO') return 'boleto';
  if (billing === 'CREDIT_CARD') return 'cartao_credito';
  if (billing === 'UNDEFINED') return 'cliente_escolhe';
  return null;
}
