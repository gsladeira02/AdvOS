import { dateBR, money } from './utils';

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    name: 'Cobrança vencida',
    slug: 'cobranca_vencida',
    category: 'cobranca',
    active: true,
    body: `Olá, {{primeiro_nome}}. Tudo bem?\n\nIdentificamos uma parcela em aberto referente ao seu atendimento com o escritório.\n\nParcela: {{parcela}}\nValor: {{valor}}\nVencimento: {{vencimento}}\n\n{{linha_link_asaas}}\n\nQualquer dúvida, estamos à disposição.`,
  },
  {
    name: 'Cobrança vencendo hoje',
    slug: 'cobranca_vencendo_hoje',
    category: 'cobranca',
    active: true,
    body: `Olá, {{primeiro_nome}}. Tudo bem?\n\nPassando para lembrar que a parcela referente ao seu atendimento vence hoje.\n\nParcela: {{parcela}}\nValor: {{valor}}\n\n{{linha_link_asaas}}\n\nQualquer dúvida, estamos à disposição.`,
  },
  {
    name: 'Contrato e cobrança',
    slug: 'contrato_e_cobranca',
    category: 'contrato',
    active: true,
    body: `Olá, {{primeiro_nome}}. Tudo bem?\n\nSeguem os links referentes ao seu atendimento com o escritório:\n\nAssinatura do documento:\n{{link_zapsign}}\n\nPagamento:\n{{link_asaas}}\n\nApós a assinatura e confirmação do pagamento, daremos andamento ao serviço.`,
  },
  {
    name: 'Lembrete de assinatura',
    slug: 'lembrete_assinatura',
    category: 'assinatura',
    active: true,
    body: `Olá, {{primeiro_nome}}. Tudo bem?\n\nEstamos passando para lembrar que o documento enviado para assinatura ainda está pendente.\n\nVocê pode assinar pelo link abaixo:\n{{link_zapsign}}\n\nQualquer dúvida, estamos à disposição.`,
  },
  {
    name: 'Pedido de documentos',
    slug: 'pedido_documentos',
    category: 'documentos',
    active: true,
    body: `Olá, {{primeiro_nome}}. Tudo bem?\n\nPara darmos andamento ao seu atendimento, precisamos que envie os documentos solicitados.\n\nPode encaminhar por aqui mesmo no WhatsApp. Assim que recebermos, conferimos e damos sequência.`,
  },
];

export function firstName(name?: string | null) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function renderMessageTemplate(template: string, values: Record<string, any>) {
  const clientName = String(values.cliente || '').trim();
  const linkAsaas = String(values.link_asaas || '').trim();
  const linkZapSign = String(values.link_zapsign || '').trim();

  const vars: Record<string, string> = {
    cliente: clientName,
    primeiro_nome: String(values.primeiro_nome || firstName(clientName) || clientName || 'tudo bem').trim(),
    servico: String(values.servico || '').trim(),
    parcela: String(values.parcela || 'Cobrança de honorários').trim(),
    valor: typeof values.valor === 'number' ? money(values.valor) : String(values.valor || '').trim(),
    vencimento: values.vencimento_iso ? dateBR(values.vencimento_iso) : String(values.vencimento || '').trim(),
    link_asaas: linkAsaas,
    link_zapsign: linkZapSign,
    escritorio: String(values.escritorio || 'escritório').trim(),
    telefone_escritorio: String(values.telefone_escritorio || '').trim(),
    linha_link_asaas: linkAsaas ? `Você pode regularizar pelo link abaixo:\n${linkAsaas}` : 'Para regularizar, entre em contato conosco por este WhatsApp.',
  };

  let rendered = template;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
