export type ExecutionClient = {
  id: string;
  name: string;
  naturalidade: string | null;
  civil_status: string | null;
  profession: string | null;
  rg: string | null;
  rg_uf: string | null;
  doc: string | null;
  address: string | null;
  contract_signed_on: string | null;
  contract_total_amount: number | string | null;
  contract_installment_count: number | null;
};
export type ExecutionInstallment = {
  id: string;
  contract_id: string;
  client_id: string;
  amount: number | string;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
  description?: string | null;
};
export type ExecutionLine = {
  id: string;
  due_date: string;
  principalCents: number;
  daysLate: number;
  alreadyDue: boolean;
  interestCents: number;
  surchargeCents: number;
  totalCents: number;
  description: string;
};
export type ExecutionCalculation = {
  lines: ExecutionLine[];
  principalCents: number;
  interestCents: number;
  surchargeCents: number;
  amountDueCents: number;
  additionalFineCents: number;
  totalCents: number;
};
export function todayInBrazil(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function isoToUTC(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data inválida.');
  return Date.parse(value + 'T00:00:00.000Z');
}
export const EXECUTION_REQUIRED: { key: keyof ExecutionClient; label: string }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'civil_status', label: 'Estado civil' },
  { key: 'profession', label: 'Profissão' },
  { key: 'rg', label: 'RG' },
  { key: 'rg_uf', label: 'Órgão/UF do RG' },
  { key: 'doc', label: 'CPF' },
  { key: 'address', label: 'Endereço' },
  { key: 'contract_signed_on', label: 'Data do contrato' },
  { key: 'contract_total_amount', label: 'Valor total do contrato' },
  { key: 'contract_installment_count', label: 'Quantidade de parcelas do contrato' },
];
export function missingExecutionFields(client: ExecutionClient) {
  const missing = EXECUTION_REQUIRED.filter(({key}) => client[key] == null || String(client[key]).trim() === '').map(x => x.label);
  if (!extractClientComarca(client.address)) missing.push('Cidade/UF identificável no endereço');
  if (client.doc && client.doc.replace(/\D/g, '').length !== 11) missing.push('CPF válido de 11 dígitos');
  if (client.contract_total_amount != null && !(Number(client.contract_total_amount) > 0)) missing.push('Valor do contrato acima de zero');
  if (client.contract_installment_count != null && !(Number(client.contract_installment_count) >= 1)) missing.push('Quantidade de parcelas maior que zero');
  if (client.contract_signed_on && !/^\d{4}-\d{2}-\d{2}$/.test(client.contract_signed_on)) missing.push('Data de contrato válida');
  return missing;
}
export function isOutstandingCollectible(item: ExecutionInstallment, today: string) {
  const status = String(item.status || '').trim().toLowerCase();
  if (['pago','recebido','confirmado','received','confirmed','paid','cancelado','cancelada','canceled','cancelled','refunded','estornado'].includes(status)) return false;
  if (item.paid_at || !item.due_date || !(Number(item.amount) > 0)) return false;
  try { return Number.isFinite(isoToUTC(item.due_date)) && Number.isFinite(isoToUTC(today)); } catch { return false; }
}
export function isOverdueCollectible(item: ExecutionInstallment, today: string) {
  return isOutstandingCollectible(item,today) && !!item.due_date && isoToUTC(item.due_date) < isoToUTC(today);
}
export function calculateExecution(items: ExecutionInstallment[], today: string, additionalFineCents = 0): ExecutionCalculation {
  if (!Number.isSafeInteger(additionalFineCents) || additionalFineCents < 0 || additionalFineCents > 1000000000) throw new Error('Multa inválida.');
  const end = isoToUTC(today);
  const lines = items.map(item => {
    if (!isOutstandingCollectible(item, today) || !item.due_date) throw new Error('Parcela paga, cancelada, sem vencimento ou inválida.');
    const principalCents = Math.round(Number(item.amount) * 100);
    if (!Number.isSafeInteger(principalCents) || principalCents < 1 || principalCents > 1000000000) throw new Error('Valor inválido de parcela.');
    const daysLate = Math.max(0, Math.floor((end - isoToUTC(item.due_date)) / 86400000));
    // Juros simples de 5% ao mês, pro rata por dias corridos / 30.
    const interestCents = Math.round(principalCents * 0.05 * (daysLate / 30));
    // Encargo fixo de 10% por parcela selecionada, uma única vez.
    const surchargeCents = Math.round(principalCents * 0.10);
    return {
      id: item.id, due_date: item.due_date, principalCents, daysLate, alreadyDue: daysLate > 0, interestCents,
      surchargeCents, totalCents: principalCents + interestCents + surchargeCents,
      description: item.description || 'Parcela contratual',
    };
  });
  if (!lines.length) throw new Error('Não existem parcelas em aberto.');
  const principalCents = lines.reduce((sum, x) => sum + x.principalCents, 0);
  const interestCents = lines.reduce((sum, x) => sum + x.interestCents, 0);
  const surchargeCents = lines.reduce((sum, x) => sum + x.surchargeCents, 0);
  const amountDueCents = principalCents + interestCents + surchargeCents;
  return { lines, principalCents, interestCents, surchargeCents, amountDueCents, additionalFineCents, totalCents: amountDueCents + additionalFineCents };
}
export function formatReal(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
export function formatBRDate(isoDate: string) {
  const [y,m,d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function extractClientComarca(address: string | null): string | null {
  const value=String(address || '').trim();if(!value)return null;
  const states:Record<string,string>={
    'espírito santo':'ES','espirito santo':'ES','minas gerais':'MG',
    'rio de janeiro':'RJ','são paulo':'SP','sao paulo':'SP','bahia':'BA',
    'paraná':'PR','parana':'PR','pernambuco':'PE','rio grande do sul':'RS',
    'santa catarina':'SC','goiás':'GO','goias':'GO','distrito federal':'DF',
    'rio grande do norte':'RN','ceará':'CE','ceara':'CE','pará':'PA','para':'PA',
    'mato grosso':'MT','mato grosso do sul':'MS','alagoas':'AL','amazonas':'AM',
    'rondônia':'RO','rondonia':'RO','maranhão':'MA','maranhao':'MA','piauí':'PI',
    'piaui':'PI','paraíba':'PB','paraiba':'PB','sergipe':'SE','acre':'AC',
    'tocantins':'TO','roraima':'RR','amapá':'AP','amapa':'AP'
  };
  for(const segment of value.split(',').map(x=>x.trim()).reverse()){
    const m=segment.match(/^(.+?)\s*[-–]\s*(.+)$/);if(!m)continue;
    const city=m[1].trim().replace(/^(?:município|cidade)\s+de\s+/i,'');
    const raw=m[2].trim().toLocaleLowerCase('pt-BR');
    const state=states[raw]||(/^[a-z]{2}$/.test(raw)?raw.toUpperCase():'');
    if(city.length>=2&&state&&!/[<>\/\d]/.test(city))return city+'/'+state;
  }
  const fallback=value.match(/(?:^|,)\s*([^,\/\d<>]{2,75})\s*\/\s*([A-Z]{2})(?:,|$)/);
  return fallback?fallback[1].trim()+'/'+fallback[2]:null;
}
