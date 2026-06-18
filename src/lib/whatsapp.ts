import { money } from './utils';

export function normalizeBrazilPhone(value?: string | null) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

export function whatsappUrl(phone?: string | null, message?: string) {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || '')}`;
}

export function buildContractLinksMessage(input: {
  clientName?: string | null;
  zapsignUrl?: string | null;
  asaasLinks?: Array<{ label?: string | null; amount?: number | string | null; dueDate?: string | null; url?: string | null }>;
}) {
  const lines: string[] = [];
  lines.push(`Olá${input.clientName ? `, ${input.clientName}` : ''}!`);
  lines.push('Segue(m) o(s) link(s) referente(s) ao atendimento do escritório:');
  if (input.zapsignUrl) lines.push(`\nAssinatura digital ZapSign:\n${input.zapsignUrl}`);
  const charges = (input.asaasLinks || []).filter((l) => l.url);
  if (charges.length) {
    lines.push('\nCobrança(s) Asaas:');
    charges.forEach((charge, index) => {
      const amount = charge.amount !== undefined && charge.amount !== null && charge.amount !== '' ? ` - ${money(Number(charge.amount || 0))}` : '';
      const due = charge.dueDate ? ` - vencimento ${formatDate(charge.dueDate)}` : '';
      lines.push(`${index + 1}. ${charge.label || 'Cobrança'}${amount}${due}\n${charge.url}`);
    });
  }
  lines.push('\nQualquer dúvida, estamos à disposição.');
  return lines.join('\n');
}

function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}
