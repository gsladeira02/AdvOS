import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

function num(v: string) {
  const n = Number(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function onlyNumbers(v?: string | null) {
  return String(v || '').replace(/\D/g, '');
}

function cleanPhone(v: string) {
  return onlyNumbers(v).replace(/^55/, '');
}

function money(value: string | number) {
  const n = typeof value === 'number' ? value : num(value);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(value?: string) {
  if (!value) return new Date().toLocaleDateString('pt-BR');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  }
  return value;
}

function addMonths(dateStr: string, months: number, preferredDay?: number) {
  const base = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T00:00:00`) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth() + months;
  const day = preferredDay || base.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const d = new Date(year, month, Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

function titleFor(type: string) {
  if (type === 'procuracao_hipossuficiencia') return 'PROCURAÇÃO E DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA';
  if (type === 'procuracao_simples') return 'PROCURAÇÃO';
  if (type === 'kit_hipossuficiencia') return 'CONTRATO DE HONORÁRIOS, PROCURAÇÃO E HIPOSSUFICIÊNCIA';
  if (type === 'kit_simples') return 'CONTRATO DE HONORÁRIOS E PROCURAÇÃO';
  return 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS';
}

function filenameFor(type: string, clientName: string) {
  const safeName = (clientName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
  const prefix = type.includes('procuracao') ? 'procuracao' : type.includes('kit') ? 'kit-contrato-procuracao' : 'contrato-honorarios';
  return `${prefix}-${safeName || 'cliente'}.pdf`;
}

function qualification(data: Record<string, string>) {
  const parts = [
    data.client_name,
    data.nationality || 'brasileiro(a)',
    data.civil_status,
    data.profession,
    data.rg ? `portador(a) da cédula de identidade nº ${data.rg}${data.rg_uf ? ` ${data.rg_uf}` : ''}` : '',
    data.cpf ? `inscrito(a) no CPF sob o nº ${data.cpf}` : '',
    data.address ? `residente e domiciliado(a) em ${data.address}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function contractSections(data: Record<string, string>) {
  const installments = Number(data.installment_count || 0);
  const paymentText = installments > 0
    ? `O pagamento será efetuado mediante entrada no valor de ${money(data.entry_amount)}, com vencimento em ${dateBR(data.entry_date)}, e ${installments} parcela(s) no valor de ${money(data.installment_amount)} cada, com vencimento todo dia ${data.due_day || '-'} de cada mês, até a quitação integral do saldo contratado.`
    : `O pagamento será efetuado mediante entrada no valor de ${money(data.entry_amount)}, com vencimento em ${dateBR(data.entry_date)}, observadas as condições de pagamento ajustadas entre as partes.`;

  const sections: { heading?: string; text: string }[] = [
    { text: `CONTRATANTE: ${qualification(data)}.` },
    { text: `CONTRATADO(S): ${data.attorneys || 'advogado(s) e/ou escritório de advocacia indicado(s) pelo contratante'}, doravante denominado(s) CONTRATADO(S).` },
    { heading: 'DO OBJETO DO CONTRATO', text: `O presente contrato tem como objeto a prestação de serviços advocatícios visando ${data.object || 'atuação administrativa e/ou judicial de interesse do(a) CONTRATANTE'}.` },
    { heading: 'DAS ATIVIDADES', text: 'O(s) CONTRATADO(S) deverá(ão) praticar todos os atos relacionados ao exercício da advocacia, obrigações tipicamente de meio, especialmente aqueles constantes no Estatuto da Ordem dos Advogados do Brasil, bem como os atos especificados na procuração outorgada.' },
    { heading: 'DOS ATOS PROCESSUAIS', text: 'A gestão do procedimento administrativo e/ou judicial correrá por conta e responsabilidade do(s) CONTRATADO(S), podendo, quando necessário, substabelecer os poderes conferidos pelo(a) CONTRATANTE a outro advogado.' },
    { heading: 'DAS DESPESAS', text: 'Caberá ao(à) CONTRATANTE, quando necessário, o pagamento de custas, taxas, emolumentos, diligências, deslocamentos, cópias, autenticações e demais despesas necessárias ao andamento do serviço, salvo ajuste escrito em sentido diverso.' },
    { heading: 'DOS HONORÁRIOS', text: `Como contraprestação pelos serviços prestados, o(a) CONTRATANTE concorda em remunerar o(s) CONTRATADO(S) no valor total de ${money(data.total_amount)}. ${paymentText}` },
    { text: data.payment_notes ? `Observações de pagamento: ${data.payment_notes}.` : 'O pagamento poderá ser realizado por PIX, boleto bancário ou outro meio previamente pactuado entre as partes.' },
    { text: 'Os eventuais honorários de sucumbência pertencem ao(s) CONTRATADO(S) e não se confundem com os honorários contratuais aqui tratados.' },
    { text: 'Havendo acordo, desistência ou encerramento antecipado por iniciativa do(a) CONTRATANTE, tal fato não prejudicará o recebimento dos honorários contratados e das despesas já realizadas.' },
    { text: 'O atraso no pagamento dos honorários poderá ensejar multa de 10% sobre o valor devido, além de juros de mora e atualização monetária, conforme pactuado entre as partes.' },
    { heading: 'DA VIGÊNCIA E DA RESCISÃO', text: 'Este contrato tem vigência até o adimplemento das obrigações ajustadas e pode ser rescindido por qualquer das partes, mediante comunicação por escrito, sem prejuízo da cobrança de honorários vencidos, despesas realizadas e serviços já prestados.' },
    { heading: 'DA RESPONSABILIDADE', text: 'O(s) CONTRATADO(S) não será(ão) responsabilizado(s) por quaisquer danos que sobrevierem da demanda patrocinada, cabendo-lhe(s) tão somente o emprego diligente de seus conhecimentos, meios e técnicas para a defesa dos interesses do(a) CONTRATANTE, inexistindo garantia de resultado.' },
    { text: 'É obrigação do(a) CONTRATANTE entregar documentos, provas, informações e subsídios necessários em tempo hábil, mantendo atualizados seus dados de contato e informações relevantes.' },
    { heading: 'DA SUSPENSÃO DOS SERVIÇOS', text: 'Em caso de inadimplemento, fica facultado ao(s) CONTRATADO(S) suspender a prestação dos serviços em andamento até a regularização, observadas as regras éticas e legais aplicáveis à advocacia.' },
    { heading: 'DO FORO', text: `Para dirimir controvérsias oriundas deste contrato, as partes elegem o foro da comarca de ${data.forum || data.local || 'Vila Velha/ES'}, salvo regra legal de competência absoluta.` },
    { text: `Por estarem assim justos e contratados, firmam o presente instrumento.\n\n${data.local || 'Vila Velha/ES'}, ${dateBR(data.contract_date)}.\n\n\n__________________________________________\n${data.client_name}\nCONTRATANTE\n\n\n__________________________________________\n${data.attorneys || 'CONTRATADO(S)'}\nCONTRATADO(S)` },
  ];
  return sections;
}

function powerSections(data: Record<string, string>, withHipossuficiencia: boolean) {
  const sections: { heading?: string; text: string }[] = [
    { heading: 'OUTORGANTE', text: `${qualification(data)}.` },
    { heading: 'OUTORGADOS', text: `${data.attorneys || 'advogado(s) e/ou escritório de advocacia indicado(s) pelo outorgante'}.` },
    { heading: 'PODERES', text: `O(a) OUTORGANTE nomeia e constitui o(s) OUTORGADO(S) seu(s) bastante(s) procurador(es), conferindo-lhe(s) poderes para representá-lo(a), em juízo ou fora dele, perante órgãos públicos, autarquias, repartições administrativas, DETRAN, CIRETRAN, JARI, CETRAN, DAER, DER, DNIT, PRF, prefeituras municipais, Poder Judiciário, Ministério Público, Defensoria Pública e demais órgãos competentes, especialmente para ${data.object || 'atuação administrativa e/ou judicial de interesse do(a) outorgante'}.` },
    { text: 'Os poderes abrangem requerer, protocolar, acompanhar processos, apresentar defesas e recursos, juntar e retirar documentos, solicitar cópias, obter informações, assinar requerimentos, receber intimações e notificações, transigir, desistir, reconvir, discordar, ratificar, retificar, receber quantias, dar quitação, substabelecer com ou sem reserva de poderes e praticar todos os demais atos necessários ao integral cumprimento do mandato.' },
  ];
  if (withHipossuficiencia) {
    sections.push(
      { heading: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA', text: 'Sob as penas da lei e para que produza seus jurídicos e legais efeitos, o(a) OUTORGANTE declara que não dispõe de rendimentos suficientes que lhe permitam arcar com custas processuais, honorários advocatícios, valores de depósito recursal e demais despesas processuais sem prejuízo de seu sustento próprio e/ou de sua família, requerendo, quando cabível, os benefícios da gratuidade da justiça.' },
      { text: 'Declara estar ciente de que a veracidade das informações prestadas poderá ser analisada pela autoridade competente e que documentos adicionais poderão ser solicitados.' }
    );
  }
  sections.push({ text: `Por ser esta a expressão da verdade, assina a presente.\n\n${data.local || 'Vila Velha/ES'}, ${dateBR(data.contract_date)}.\n\n\n__________________________________________\n${data.client_name}\nOUTORGANTE` });
  return sections;
}

function docsForType(data: Record<string, string>) {
  const type = data.document_type;
  if (type === 'procuracao_simples') return [{ title: 'PROCURAÇÃO', sections: powerSections(data, false) }];
  if (type === 'procuracao_hipossuficiencia') return [{ title: 'PROCURAÇÃO E DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA', sections: powerSections(data, true) }];
  if (type === 'kit_simples') return [
    { title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS', sections: contractSections(data) },
    { title: 'PROCURAÇÃO', sections: powerSections(data, false) },
  ];
  if (type === 'kit_hipossuficiencia') return [
    { title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS', sections: contractSections(data) },
    { title: 'PROCURAÇÃO E DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA', sections: powerSections(data, true) },
  ];
  return [{ title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS', sections: contractSections(data) }];
}

function splitWords(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function wrapLine(text: string, font: any, size: number, maxWidth: number) {
  const words = splitWords(text);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function generatePdfBuffer(data: Record<string, string>) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 62;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 11;
  const lineHeight = 15;
  const docs = docsForType(data);
  let page: any;
  let y = 0;

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText('LADEIRA ADVOGADOS', { x: pageWidth - margin - 128, y: pageHeight - 45, size: 10, font: bold, color: rgb(0.18, 0.18, 0.18) });
    page.drawText('Rod. do Sol, 2070. Ed. Royal Blue Corporate, sala 1008. Praia de Itaparica, Vila Velha - ES. Contato: (27) 99794-0089.', {
      x: margin,
      y: 36,
      size: 7.5,
      font: regular,
      color: rgb(0.25, 0.25, 0.25),
    });
  }

  function ensure(space: number) {
    if (y - space < 64) newPage();
  }

  function drawCentered(text: string, size = 14) {
    ensure(size + 22);
    const w = bold.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (pageWidth - w) / 2, y, size, font: bold, color: rgb(0, 0, 0) });
    y -= size + 22;
  }

  function drawParagraph(text: string, opts: { heading?: boolean } = {}) {
    const chunks = String(text || '').split('\n');
    for (const chunk of chunks) {
      if (!chunk.trim()) {
        y -= lineHeight;
        continue;
      }
      const font = opts.heading ? bold : regular;
      const size = opts.heading ? 11.5 : fontSize;
      const lines = wrapLine(chunk, font, size, maxWidth);
      ensure(lines.length * lineHeight + 8);
      for (const line of lines) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }
      y -= opts.heading ? 3 : 6;
    }
  }

  docs.forEach((doc, index) => {
    newPage();
    drawCentered(doc.title, 14);
    doc.sections.forEach((s) => {
      if (s.heading) drawParagraph(s.heading, { heading: true });
      drawParagraph(s.text);
    });
    if (index < docs.length - 1) {
      // próxima iteração cria página nova
    }
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function zapsignSend(lawFirmId: string, documentTitle: string, pdfBuffer: Buffer, data: Record<string, string>, documentId: string | null) {
  const config = await getIntegrationConfig(lawFirmId, 'zapsign');
  const basePayload = {
    law_firm_id: lawFirmId,
    document_id: documentId,
    provider: 'zapsign',
    signer_name: data.client_name,
    signer_email: data.email || null,
    signer_phone: data.phone || null,
    sent_at: new Date().toISOString(),
  };

  if (!config.configured) {
    return { status: 'configuracao_pendente', payload: basePayload };
  }

  const phoneNumber = cleanPhone(data.phone || '');
  const responsiblePhone = cleanPhone(data.responsible_signer_phone || '');
  const signers: any[] = [
    {
      name: data.client_name,
      email: data.email || undefined,
      phone_country: phoneNumber ? '55' : undefined,
      phone_number: phoneNumber || undefined,
      send_automatic_email: Boolean(data.email),
      send_automatic_whatsapp: Boolean(phoneNumber),
    },
  ];
  if (data.responsible_signer_name || data.responsible_signer_email || responsiblePhone) {
    signers.push({
      name: data.responsible_signer_name || 'Representante do escritório',
      email: data.responsible_signer_email || undefined,
      phone_country: responsiblePhone ? '55' : undefined,
      phone_number: responsiblePhone || undefined,
      send_automatic_email: Boolean(data.responsible_signer_email),
      send_automatic_whatsapp: Boolean(responsiblePhone),
    });
  }

  const response = await fetch(`${config.baseUrl}/docs/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: documentTitle,
      base64_pdf: pdfBuffer.toString('base64'),
      signers,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.detail || json?.message || 'Erro ao criar documento na ZapSign.';
    return { status: 'erro', error: message, raw: json, payload: basePayload };
  }

  const signer = Array.isArray(json?.signers) ? json.signers[0] : null;
  return {
    status: json?.status || 'enviado',
    external_id: json?.token || json?.open_id || json?.id || null,
    signature_url: signer?.sign_url || json?.sign_url || null,
    signed_document_url: json?.signed_file || null,
    raw: json,
    payload: basePayload,
  };
}

function mapAsaasStatus(status?: string) {
  const s = String(status || '').toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(s)) return 'pago';
  if (s === 'OVERDUE') return 'atrasado';
  return 'pendente';
}

async function asaasFetch(baseUrl: string, token: string, path: string, body: any) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'AdvOS',
      access_token: token,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.errors?.[0]?.description || json?.message || 'Erro na API do Asaas.';
    throw new Error(message);
  }
  return json;
}

async function createAsaasCharges(admin: any, profile: any, financialContractId: string, data: Record<string, string>, clientRow: any) {
  const config = await getIntegrationConfig(profile.law_firm_id, 'asaas');
  const billingType = data.billing_type || config.defaultBillingType || 'BOLETO';
  const installmentsToCreate: { amount: number; due_date: string; label: string }[] = [];
  const entryAmount = num(data.entry_amount);
  const installmentCount = Number(data.installment_count || 0);
  const installmentAmount = num(data.installment_amount);
  const entryDate = data.entry_date || new Date().toISOString().slice(0, 10);
  const dueDay = Number(data.due_day || 0) || undefined;

  if (entryAmount > 0) installmentsToCreate.push({ amount: entryAmount, due_date: entryDate, label: 'Entrada de honorários advocatícios' });
  for (let i = 1; i <= installmentCount; i++) {
    if (installmentAmount > 0) installmentsToCreate.push({ amount: installmentAmount, due_date: addMonths(entryDate, i, dueDay), label: `Parcela ${i}/${installmentCount} de honorários advocatícios` });
  }

  const created: any[] = [];
  if (!installmentsToCreate.length && num(data.total_amount) > 0) {
    installmentsToCreate.push({ amount: num(data.total_amount), due_date: entryDate, label: 'Honorários advocatícios' });
  }

  for (const item of installmentsToCreate) {
    const { data: installment } = await admin.from('financial_installments').insert({
      law_firm_id: profile.law_firm_id,
      contract_id: financialContractId,
      amount: item.amount,
      due_date: item.due_date,
      status: 'pendente',
      provider: 'asaas',
      billing_type: billingType,
      integration_status: config.configured ? 'preparando' : 'configuracao_pendente',
    }).select('id').single();

    if (!installment?.id) continue;
    created.push(installment.id);

    if (!config.configured) continue;

    try {
      let customerId = clientRow?.asaas_customer_id || null;
      if (!customerId) {
        const customer = await asaasFetch(config.baseUrl, config.token, '/customers', {
          name: clientRow?.name || data.client_name,
          cpfCnpj: onlyNumbers(clientRow?.doc || data.cpf) || undefined,
          email: clientRow?.email || data.email || undefined,
          mobilePhone: onlyNumbers(clientRow?.whatsapp || clientRow?.phone || data.phone) || undefined,
          externalReference: clientRow?.id || undefined,
        });
        customerId = customer.id;
        if (clientRow?.id) {
          await admin.from('clients').update({ asaas_customer_id: customerId }).eq('id', clientRow.id).eq('law_firm_id', profile.law_firm_id);
        }
      }

      const payment = await asaasFetch(config.baseUrl, config.token, '/payments', {
        customer: customerId,
        billingType,
        dueDate: item.due_date,
        value: item.amount,
        description: `${item.label} - ${data.client_name}`,
        externalReference: installment.id,
      });

      await admin.from('financial_installments').update({
        external_id: payment.id,
        integration_status: 'criada',
        status: mapAsaasStatus(payment.status),
        payment_url: payment.paymentLink || payment.invoiceUrl || null,
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
        billing_type: payment.billingType || billingType,
        raw_payload: payment,
        updated_at: new Date().toISOString(),
      }).eq('id', installment.id).eq('law_firm_id', profile.law_firm_id);
    } catch (error: any) {
      await admin.from('financial_installments').update({
        integration_status: 'erro',
        raw_payload: { message: error?.message || 'Erro desconhecido' },
        updated_at: new Date().toISOString(),
      }).eq('id', installment.id).eq('law_firm_id', profile.law_firm_id);
    }
  }

  return created;
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const f = await req.formData();
  const data: Record<string, string> = {
    document_type: str(f.get('document_type')) || 'contrato_honorarios',
    client_id: str(f.get('client_id')),
    case_id: str(f.get('case_id')),
    client_name: str(f.get('client_name')),
    nationality: str(f.get('nationality')),
    civil_status: str(f.get('civil_status')),
    profession: str(f.get('profession')),
    rg: str(f.get('rg')),
    rg_uf: str(f.get('rg_uf')),
    cpf: str(f.get('cpf')),
    address: str(f.get('address')),
    phone: str(f.get('phone')),
    email: str(f.get('email')),
    local: str(f.get('local')) || 'Vila Velha/ES',
    forum: str(f.get('forum')),
    contract_date: str(f.get('contract_date')) || new Date().toISOString().slice(0, 10),
    object: str(f.get('object')),
    attorneys: str(f.get('attorneys')),
    responsible_signer_name: str(f.get('responsible_signer_name')),
    responsible_signer_email: str(f.get('responsible_signer_email')),
    responsible_signer_phone: str(f.get('responsible_signer_phone')),
    total_amount: str(f.get('total_amount')),
    entry_amount: str(f.get('entry_amount')),
    entry_date: str(f.get('entry_date')),
    installment_count: str(f.get('installment_count')),
    installment_amount: str(f.get('installment_amount')),
    due_day: str(f.get('due_day')),
    payment_notes: str(f.get('payment_notes')),
    billing_type: str(f.get('billing_type')) || 'BOLETO',
  };

  const admin = createAdminSupabase();
  const { data: clientRow } = data.client_id
    ? await admin.from('clients').select('*').eq('id', data.client_id).eq('law_firm_id', profile.law_firm_id).maybeSingle()
    : { data: null } as any;

  // Se o usuário selecionar um cliente e deixar campos em branco, usamos o cadastro do cliente.
  if (clientRow) {
    data.client_name = data.client_name || clientRow.name || '';
    data.email = data.email || clientRow.email || '';
    data.phone = data.phone || clientRow.whatsapp || clientRow.phone || '';
    data.cpf = data.cpf || clientRow.doc || '';
    data.address = data.address || clientRow.address || '';
  }

  if (!data.client_name) return NextResponse.json({ error: 'Informe o nome do contratante/outorgante.' }, { status: 400 });

  const filename = filenameFor(data.document_type, data.client_name);
  const pdfBuffer = await generatePdfBuffer(data);
  const storagePath = `${profile.law_firm_id}/contratos/${Date.now()}-${filename}`;

  await admin.storage.from('documents').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  }).catch(() => null);

  const { data: doc } = await admin.from('documents').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    case_id: data.case_id || null,
    title: filename,
    doc_type: data.document_type,
    storage_path: storagePath,
    notes: 'PDF gerado automaticamente pela aba Contratos do AdvOS.',
    signature_status: 'preparando_zapsign',
  }).select('id').single();

  const { data: generated } = await admin.from('generated_contracts').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    case_id: data.case_id || null,
    generated_by: session.user.id,
    document_type: data.document_type,
    client_name: data.client_name,
    civil_status: data.civil_status || null,
    profession: data.profession || null,
    rg: data.rg || null,
    rg_uf: data.rg_uf || null,
    cpf: data.cpf || null,
    address: data.address || null,
    phone: data.phone || null,
    email: data.email || null,
    local: data.local || null,
    contract_date: data.contract_date || null,
    object: data.object || null,
    attorneys: data.attorneys || null,
    total_amount: num(data.total_amount),
    entry_amount: num(data.entry_amount),
    entry_date: data.entry_date || null,
    installment_count: Number(data.installment_count || 0),
    installment_amount: num(data.installment_amount),
    due_day: data.due_day ? Number(data.due_day) : null,
    has_hypo: ['procuracao_hipossuficiencia', 'kit_hipossuficiencia'].includes(data.document_type),
    pdf_filename: filename,
    pdf_storage_path: storagePath,
    document_id: doc?.id || null,
    zapsign_status: 'preparando',
    asaas_status: 'preparando',
  }).select('id').single();

  const { data: financialContract } = await admin.from('financial_contracts').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    description: `${titleFor(data.document_type)} - ${data.client_name}`,
    total_amount: num(data.total_amount),
    status: 'ativo',
  }).select('id').single();

  const asaasIds = financialContract?.id
    ? await createAsaasCharges(admin, profile, financialContract.id, data, clientRow)
    : [];

  const zap = await zapsignSend(profile.law_firm_id, filename, pdfBuffer, data, doc?.id || null);
  await admin.from('document_signatures').insert({
    ...zap.payload,
    status: zap.status,
    external_id: (zap as any).external_id || null,
    signature_url: (zap as any).signature_url || null,
    signed_document_url: (zap as any).signed_document_url || null,
    raw_payload: (zap as any).raw || { error: (zap as any).error || null },
  });

  if (doc?.id) {
    await admin.from('documents').update({
      zapsign_doc_token: (zap as any).external_id || null,
      signature_status: zap.status,
    }).eq('id', doc.id).eq('law_firm_id', profile.law_firm_id);
  }

  if (generated?.id) {
    await admin.from('generated_contracts').update({
      financial_contract_id: financialContract?.id || null,
      asaas_status: asaasIds.length ? 'cobrancas_criadas' : 'sem_cobrancas_ou_configuracao_pendente',
      zapsign_status: zap.status,
      zapsign_token: (zap as any).external_id || null,
      zapsign_url: (zap as any).signature_url || null,
      raw_zapsign_payload: (zap as any).raw || { error: (zap as any).error || null },
    }).eq('id', generated.id).eq('law_firm_id', profile.law_firm_id);
  }

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: session.user.id,
    action: 'gerou_pdf_zapsign_asaas',
    entity: 'generated_contracts',
    entity_id: generated?.id || null,
  });

  return NextResponse.redirect(new URL('/app/contratos?gerado=1', req.url), 303);
}
