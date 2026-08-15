import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { safeInternalPath } from '@/lib/security';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { optimizeStoredDocument } from '@/lib/documentOptimization';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getIntegrationConfig } from '@/lib/integrations';
import { paymentMethodFromBillingType } from '@/lib/finance';

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
  const total = money(data.total_amount);
  const entry = money(data.entry_amount);
  const installmentCount = Number(data.installment_count || 0);
  const installment = money(data.installment_amount);
  const paymentText = installmentCount > 0
    ? `O pagamento será efetuado da seguinte forma: uma entrada via ${paymentMethodLabel(data.billing_type)} no valor de ${entry}, a ser efetuado até a data de ${dateBR(data.entry_date)}, seguida por ${installmentCount} parcela(s) no valor de ${installment} cada, com vencimento conforme as datas e condições ajustadas entre as partes, totalizando o valor de ${total}. O pagamento poderá ser realizado por meio de transferência via CHAVE PIX CNPJ 57.377.637/0001-19, caso seja previamente pactuado entre as partes, ou, em caso de atraso, por meio de boleto bancário.`
    : `O pagamento será efetuado no valor total de ${total}, observadas as datas e condições previamente pactuadas entre as partes. O pagamento poderá ser realizado por meio de transferência via CHAVE PIX CNPJ 57.377.637/0001-19, caso seja previamente pactuado entre as partes, ou, em caso de atraso, por meio de boleto bancário.`;
  const successText = data.success_fee ? `Caso haja eventual benefício econômico decorrente de danos morais, o CONTRATADO será remunerado com um percentual correspondente a ${data.success_fee}% do benefício econômico auferido.` : 'Caso haja eventual benefício econômico decorrente de danos morais, o CONTRATADO será remunerado com um percentual correspondente a 30% do benefício econômico auferido.';
  return [
    { text: `CONTRATANTE: ${qualification(data)}` },
    { text: `CONTRATADO: ${data.attorneys || 'DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA, pessoa jurídica de direito privado, inscrita na OAB sob o CNPJ 57.377.637/0001-19, com endereço profissional na Rodovia do Sol, Edifício Royal Blue Corporate, nº 2070, sala 1008, Praia de Itaparica, Vila Velha/ES, representada por Dr. DANIEL COSTA LADEIRA, OAB/ES nº 23.416, e-mail dladadeiradv@gmail.com.'}` },
    { text: 'As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Honorários Advocatícios, que se regerá pelas cláusulas e pelas condições a seguir descritas.' },
    { heading: 'DO OBJETO DO CONTRATO', text: `Cláusula 1ª. O presente contrato tem como objeto a prestação de serviços advocatícios visando ${data.object || 'a prestação de serviços jurídicos conforme a demanda informada pelo(a) CONTRATANTE'}.` },
    { heading: 'DAS ATIVIDADES', text: 'Cláusula 2ª. O CONTRATADO deverá praticar todos os atos relacionados ao exercício da advocacia, obrigações tipicamente de meio, particularmente aqueles constantes no Estatuto da Ordem dos Advogados do Brasil, assim como o que for especificado na outorga da procuração, com a diligência habitual que se presume da atuação profissional.' },
    { heading: 'DOS ATOS PROCESSUAIS', text: 'Cláusula 3ª. A gestão do processo correrá por conta e responsabilidade do CONTRATADO, podendo, se necessário, substabelecer os poderes que lhe foram conferidos pelo CONTRATANTE a outro advogado.' },
    { heading: 'DAS DESPESAS', text: 'Cláusula 4ª. Ao CONTRATANTE caberá ainda, se necessário, o pagamento das custas judiciais, em caso de indeferimento do benefício da AJG.' },
    { heading: 'DOS HONORÁRIOS', text: `Cláusula 5ª. O CONTRATANTE, como contraprestação pelos serviços prestados, concorda em remunerar o CONTRATADO no valor total de ${total}. ${paymentText}` },
    { text: 'Parágrafo primeiro. O adimplemento dos valores ajustados na presente cláusula será feito exclusivamente através de boleto bancário ou PIX a ser expedido diretamente pelo CONTRATANTE.' },
    { text: successText },
    { text: 'Cláusula 6ª. Os eventuais honorários de sucumbência pertencem ao CONTRATADO e não se confundem com os honorários contratuais aqui tratados.' },
    { text: 'Parágrafo único. Caso haja morte ou incapacidade civil do CONTRATADO, seus sucessores ou representante legal receberão os honorários na proporção do trabalho realizado.' },
    { text: 'Cláusula 7ª. Havendo acordo entre o CONTRATANTE e a parte contrária ou desistência pelo CONTRATANTE, este fato não prejudicará o recebimento de todos os honorários contratados e da sucumbência, se houver, pelo CONTRATADO.' },
    { text: 'Cláusula 8ª. O atraso no pagamento dos honorários ensejará multa no valor de 10% (dez por cento) sobre o valor devido e serão cobrados juros de mora na proporção de 5% (cinco por cento) ao mês, devidamente atualizados pelo IGPM + 1%.' },
    { text: 'Parágrafo primeiro. Caso a mora seja superior a 30 (trinta) dias, serão consideradas vencidas as demais obrigações vincendas, que serão exigidas de imediato.' },
    { text: 'Parágrafo segundo. Na hipótese do parágrafo anterior, se houver a liberalidade do CONTRATADO, este contrato poderá ser rescindido de pleno direito, independentemente de qualquer medida judicial ou extrajudicial.' },
    { text: 'Parágrafo terceiro. Havendo a necessidade de propor-se ação judicial para cobrança dos honorários aqui estabelecidos, o valor principal será atualizado monetariamente pelo IGPM, com acréscimo de juros de 5% ao mês, multa de 10% sobre o valor a ser executado e honorários advocatícios na execução no percentual de 20% sobre o valor cobrado naquela demanda.' },
    { heading: 'DA VIGÊNCIA E DA RESCISÃO', text: 'Cláusula 9ª. Este contrato tem vigência até o adimplemento das obrigações ajustadas e pode ser rescindido a qualquer tempo por qualquer das partes, mediante aviso prévio de 30 (trinta) dias, por escrito e com comprovante de entrega.' },
    { text: 'Parágrafo primeiro. Na hipótese de rescisão antecipada pelo CONTRATANTE, este deverá pagar multa contratual, bem como, para os valores pro êxito, um percentual correspondente à parcela do serviço que foi executada pelo CONTRATADO, observado o que tiver sido pactuado.' },
    { text: 'Parágrafo segundo. Na hipótese de rescisão antecipada pelo CONTRATADO, haverá cobrança de honorários proporcionais aos serviços prestados.' },
    { text: 'Parágrafo terceiro. A prestação do serviço será iniciada após o efetivo pagamento do valor de entrada pactuado na Cláusula 5ª.' },
    { text: 'O CONTRATADO poderá, a seu critério, realizar diligências prévias necessárias antes da efetivação do pagamento da entrada supramencionada, contudo as eventuais despesas destas diligências deverão ser previamente depositadas pelo CONTRATANTE.' },
    { heading: 'DA RESPONSABILIDADE', text: 'Cláusula 10ª. O CONTRATADO não será responsabilizado por quaisquer danos que sobrevierem das demandas que patrocinar, cabendo-lhe tão somente o emprego diligente de seus conhecimentos, meios e técnicas para a defesa dos interesses do CONTRATANTE, inexistente qualquer garantia de resultado.' },
    { text: 'Cláusula 11ª. O CONTRATADO não será responsabilizado acaso resultem danos por não tomar conhecimento de informações e documentos substanciais para a sua atividade ou em decorrência da impossibilidade de contato com o CONTRATANTE, que deverá manter atualizadas quaisquer informações relevantes para a demanda, bem como as informações cadastrais fornecidas por aquele.' },
    { text: 'Cláusula 12ª. É obrigação do CONTRATANTE, sempre que solicitada, entregar, fornecer ou disponibilizar ao CONTRATADO todos os documentos necessários, provas, informações e subsídios, em tempo hábil, para que este possa cumprir o objeto do presente contrato. Qualquer omissão ou negligência por parte do CONTRATANTE será de sua inteira responsabilidade, caso advenha qualquer prejuízo a seus interesses.' },
    { heading: 'DA SUSPENSÃO DOS SERVIÇOS', text: 'Cláusula 13ª. Em caso de não pagamento das parcelas dentro do prazo estipulado, fica ao contratado o direito de suspender, automaticamente, a prestação dos serviços em andamento, até que a situação seja regularizada, observadas as regras legais e éticas aplicáveis.' },
    { text: 'Parágrafo primeiro. Na hipótese de ocorrência do previsto na cláusula acima, o CONTRATANTE estará sujeito às consequências previstas neste contrato e na legislação aplicável.' },
    { heading: 'DO FORO', text: `Cláusula 14ª. Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o foro da comarca de ${data.forum || data.local || 'Vila Velha/ES'}.` },
    { text: `Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.\n\n${data.local || 'Vila Velha/ES'}, ${dateBR(data.contract_date)}.\n\n\n__________________________________________\n${data.client_name}\nCONTRATANTE\n\n\n__________________________________________\n${data.attorneys || 'DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA'}\nCONTRATADO` },
  ];
}

function paymentMethodLabel(type?: string) {
  const map: Record<string,string> = { PIX: 'PIX', BOLETO: 'boleto bancário', CREDIT_CARD: 'cartão de crédito', UNDEFINED: 'forma de pagamento escolhida pelo cliente' };
  return map[String(type || '').toUpperCase()] || 'forma de pagamento previamente ajustada';
}

function powerSections(data: Record<string, string>, withHipossuficiencia: boolean) {
  const sections: { heading?: string; text: string }[] = [
    { text: `OUTORGANTE: ${qualification(data)}.` },
    { text: `OUTORGADOS: ${data.attorneys || 'DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA, pessoa jurídica de direito privado, inscrita na OAB sob o CNPJ 57.377.637/0001-19, representada por Dr. DANIEL COSTA LADEIRA, OAB/ES nº 23.416.'}` },
    { heading: 'PODERES', text: `O OUTORGANTE nomeia e constitui o OUTORGADO seu procurador; onde este se apresentar, outorgando-lhe os necessários poderes para representá-lo, em juízo ou fora dele, junto à ação em que é réu, podendo, nesta ação, e tudo praticar, requerer, assinar, com poderes para transigir, desistir, reconvir, discordar, ratificar, retificar, receber quantias e intimações, dar quitação, propor contraposição, acompanhar quaisquer recursos em todos os termos ou instâncias, responder perante qualquer repartição pública ou privada, autarquia ou órgão federal, estadual ou municipal no que se refere a esta ação em específico, e ainda praticar todos os demais atos que se fizerem necessários ao integral cumprimento do presente mandato, para o que confere os mais amplos poderes, bem como os contidos na cláusula “ad judicia”, podendo, ainda, substabelecer, no todo ou em parte, com ou sem reserva, os poderes ora conferidos, que se destinam especialmente para fim de representação do outorgante na ${data.object || 'ação judicial e/ou atuação administrativa relacionada ao caso do outorgante'}, bem como para interpor recursos administrativos contra DETRAN, DAER, DER, DNIT, PRF e Prefeituras Municipais, quando cabível.` },
  ];
  if (withHipossuficiencia) {
    sections.push(
      { heading: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA', text: 'Sob as penas da lei e para que produza seus jurídicos e legais efeitos, atendendo ao disposto na legislação aplicável, DECLARO que não disponho de rendimentos suficientes que me permitam pagar custas processuais, honorários advocatícios e valores de depósito recursal, para postular em meu nome no Juízo desta comarca, sendo desta forma considerado juridicamente necessitado, requerendo, portanto, o deferimento do benefício da gratuidade de justiça.' },
      { text: `Por ser esta a expressão da verdade, assino a presente.\n\n${String(data.local || 'Vila Velha/ES').toUpperCase()}, ${dateBR(data.contract_date)}\n\n\n__________________________________________\n${data.client_name}\nOUTORGANTE` },
    );
  } else {
    sections.push({ text: `Por ser esta a expressão da verdade, assino a presente.\n\n${String(data.local || 'Vila Velha/ES').toUpperCase()}, ${dateBR(data.contract_date)}\n\n\n__________________________________________\n${data.client_name}\nOUTORGANTE` });
  }
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
  const W = 595.28, H = 841.89;
  const marginX = 66, topY = 748, bottomY = 62, contentW = W - marginX * 2;
  const fontSize = 10.5, lineH = 15.3;
  const logoPath = join(process.cwd(), 'public', 'brand', 'ladeira-advogados.png');
  let logo: any = null;
  try { logo = await pdf.embedPng(readFileSync(logoPath)); } catch {}
  const docs = docsForType(data);
  let page: any = null, y = topY, pageNo = 0;
  const green = rgb(0.03, 0.37, 0.31), gray = rgb(0.32,0.32,0.32), black = rgb(0,0,0);
  function newPage() {
    page = pdf.addPage([W,H]); pageNo += 1; y = topY;
    if (logo) { const s=logo.scaleToFit(96,52); page.drawImage(logo,{x:marginX,y:H-72,width:s.width,height:s.height}); }
    page.drawText('LADEIRA ADVOGADOS',{x:W-marginX-150,y:H-58,size:9,font:bold,color:gray});
    page.drawLine({start:{x:marginX,y:H-82},end:{x:W-marginX,y:H-82},thickness:0.8,color:rgb(.82,.82,.82)});
    page.drawText(`Documento gerado pelo AdvOS · Página ${pageNo}`,{x:marginX,y:28,size:6.8,font:regular,color:gray});
    page.drawText('Rod. do Sol, 2070 · Ed. Royal Blue Corporate · sala 1008 · Praia de Itaparica · Vila Velha/ES · (27) 99794-0089',{x:W-marginX-330,y:28,size:6.4,font:regular,color:gray});
  }
  function ensure(h:number){ if(!page) newPage(); if(y-h<bottomY) newPage(); }
  function wrap(text:string,font:any,size:number,max:number){ const out:string[]=[]; let line=''; for(const word of String(text||'').replace(/\s+/g,' ').trim().split(' ')){ const n=line?`${line} ${word}`:word; if(font.widthOfTextAtSize(n,size)<=max) line=n; else { if(line) out.push(line); line=word; } } if(line) out.push(line); return out; }
  function para(text:string, opts:{heading?:boolean;center?:boolean}={}){
    const f=opts.heading?bold:regular, sz=opts.heading?11.2:fontSize;
    for(const chunk of String(text||'').split('\n')){
      if(!chunk.trim()){ y-=lineH*.55; continue; }
      const lines=wrap(chunk,f,sz,contentW);
      for(const line of lines){ ensure(lineH); const x=opts.center?(W-f.widthOfTextAtSize(line,sz))/2:marginX; page.drawText(line,{x,y,size:sz,font:f,color:opts.heading?green:black}); y-=lineH; }
      y-=opts.heading?4:2;
    }
  }
  for(let di=0;di<docs.length;di++){
    newPage();
    para(docs[di].title,{heading:true,center:true}); y-=5;
    for(const section of docs[di].sections){ if(section.heading) para(section.heading,{heading:true}); para(section.text); }
    if(di<docs.length-1){ y=bottomY+1; }
  }
  return Buffer.from(await pdf.save());
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
      payment_method: paymentMethodFromBillingType(billingType),
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
        payment_method: paymentMethodFromBillingType(payment.billingType || billingType),
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
    service_id: str(f.get('service_id')),
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
    redirect_to: str(f.get('redirect_to')),
  };

  const admin = createAdminSupabase();
  const { data: clientRow } = data.client_id
    ? await admin.from('clients').select('*').eq('id', data.client_id).eq('law_firm_id', profile.law_firm_id).maybeSingle()
    : { data: null } as any;

  const serviceId = data.service_id || clientRow?.service_id || null;
  const { data: serviceRow } = serviceId
    ? await admin.from('legal_services').select('*').eq('id', serviceId).eq('law_firm_id', profile.law_firm_id).maybeSingle()
    : { data: null } as any;

  if (serviceRow) {
    data.object = data.object || serviceRow.description || serviceRow.name || '';
    data.total_amount = data.total_amount || String(serviceRow.default_amount || '');
  }

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
  const optimizedPdf = await optimizeStoredDocument({
    buffer: Buffer.from(pdfBuffer),
    fileName: filename,
    mimeType: 'application/pdf',
  });
  const storagePath = `${profile.law_firm_id}/contratos/${Date.now()}-${filename}`;

  await admin.storage.from('documents').upload(storagePath, optimizedPdf.buffer, {
    contentType: 'application/pdf',
    upsert: true,
  }).catch(() => null);

  const { data: doc } = await admin.from('documents').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    service_id: serviceId,
    case_id: data.case_id || null,
    title: filename,
    doc_type: data.document_type,
    storage_path: storagePath,
    notes: `PDF gerado automaticamente pela pasta do cliente no AdvOS e otimizado antes do armazenamento. Tamanho: ${optimizedPdf.storedBytes} bytes.`,
    signature_status: 'pendente',
  }).select('id').single();

  const { data: generated } = await admin.from('generated_contracts').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    service_id: serviceId,
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
    zapsign_status: 'pendente',
    asaas_status: 'preparando',
  }).select('id').single();

  const { data: financialContract } = await admin.from('financial_contracts').insert({
    law_firm_id: profile.law_firm_id,
    client_id: data.client_id || null,
    service_id: serviceId,
    description: `${titleFor(data.document_type)}${serviceRow?.name ? ` - ${serviceRow.name}` : ''} - ${data.client_name}`,
    total_amount: num(data.total_amount),
    status: 'ativo',
  }).select('id').single();

  const asaasIds = financialContract?.id
    ? await createAsaasCharges(admin, profile, financialContract.id, data, clientRow)
    : [];

  // Cria a solicitação de assinatura nativa do AdvOS e envia o link diretamente pela API oficial do WhatsApp.
  // A assinatura é criada e enviada pelo fluxo nativo do AdvOS; nenhuma plataforma externa é usada para o link do cliente.
  const clientToken = crypto.randomBytes(28).toString('base64url');
  const danielToken = crypto.randomBytes(28).toString('base64url');
  const signatureExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const signatureRequireSelfie = true;
  const signatureRequireOtp = true;
  const signatureRequireDocumentPhoto = false;
  const { data: signatureRequest, error: signatureRequestError } = await admin.from('signature_requests').insert({
    law_firm_id: profile.law_firm_id,
    document_id: doc?.id || null,
    public_token: clientToken,
    status: 'pendente',
    require_selfie: signatureRequireSelfie,
    require_document_photo: signatureRequireDocumentPhoto,
    require_otp: signatureRequireOtp,
    consent_text: 'Autorizo a coleta e o tratamento das informações e imagens estritamente necessários para comprovar minha identidade e minha assinatura neste documento.',
    expires_at: signatureExpiresAt,
    created_by: session.user.id,
  }).select('id,public_token').single();
  if (signatureRequestError || !signatureRequest) {
    throw new Error(signatureRequestError?.message || 'Não foi possível criar o link de assinatura.');
  }

  const { data: clientSigner, error: clientSignerError } = await admin.from('signature_signers').insert({
    law_firm_id: profile.law_firm_id,
    request_id: signatureRequest.id,
    signer_token: clientToken,
    signer_order: 1,
    name: data.client_name,
    email: data.email || null,
    phone: cleanPhone(data.phone || ''),
    cpf: onlyNumbers(data.cpf || '') || null,
    role: 'cliente',
    status: 'pendente',
  }).select('id').single();
  if (clientSignerError || !clientSigner) throw new Error(clientSignerError?.message || 'Não foi possível criar o signatário cliente.');

  const { data: danielSigner, error: danielSignerError } = await admin.from('signature_signers').insert({
    law_firm_id: profile.law_firm_id,
    request_id: signatureRequest.id,
    signer_token: danielToken,
    signer_order: 2,
    name: 'DANIEL COSTA LADEIRA',
    email: 'dladadeiradv@gmail.com',
    phone: '5527997940089',
    role: 'advogado',
    status: 'pendente',
  }).select('id').single();
  if (danielSignerError || !danielSigner) throw new Error(danielSignerError?.message || 'Não foi possível criar Daniel Costa Ladeira como signatário.');

  if (doc?.id) {
    await admin.from('documents').update({
      signature_request_id: signatureRequest.id,
      signature_status: 'pendente',
    }).eq('id', doc.id).eq('law_firm_id', profile.law_firm_id);
  }

  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    const forwardedProto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':','');
    const appOrigin = `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
  const signatureUrl = `${appOrigin}/assinar/${clientToken}`;
  let signatureWhatsappStatus = 'nao_enviado';
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsappApi');
    if (!data.phone) throw new Error('WhatsApp do cliente não informado.');
    await sendWhatsAppText({
      lawFirmId: profile.law_firm_id,
      to: cleanPhone(data.phone),
      clientId: data.client_id || null,
      sentBy: session.user.id,
      message: `Olá, ${data.client_name}! O Ladeira Advogados enviou o documento “${filename}” para assinatura.\n\nAcesse o link seguro para visualizar e assinar:\n${signatureUrl}\n\nO link é válido por 7 dias.`,
    });
    signatureWhatsappStatus = 'enviado_pela_api';
    await admin.from('signature_events').insert({
      law_firm_id: profile.law_firm_id,
      request_id: signatureRequest.id,
      signer_id: clientSigner.id,
      event_type: 'link_enviado_whatsapp_api',
      metadata: { to: cleanPhone(data.phone), signature_url: signatureUrl },
    });
  } catch (e: any) {
    signatureWhatsappStatus = 'erro_no_envio_api';
    await admin.from('signature_events').insert({
      law_firm_id: profile.law_firm_id,
      request_id: signatureRequest.id,
      signer_id: clientSigner.id,
      event_type: 'erro_envio_whatsapp_api',
      metadata: { error: String(e?.message || e || 'Erro desconhecido') },
    });
  }

  const signaturePayload = {
    law_firm_id: profile.law_firm_id,
    document_id: doc?.id || null,
    provider: 'advos',
    signer_name: data.client_name,
    signer_email: data.email || null,
    signer_phone: data.phone || null,
    sent_at: new Date().toISOString(),
    status: 'pendente',
    external_id: signatureRequest.id,
    signature_url: signatureUrl,
    signed_document_url: null,
    raw_payload: { request_id: signatureRequest.id, client_signer_id: clientSigner.id, daniel_signer_id: danielSigner.id },
  };
  await admin.from('document_signatures').insert(signaturePayload);


  if (generated?.id) {
    await admin.from('generated_contracts').update({
      financial_contract_id: financialContract?.id || null,
      asaas_status: asaasIds.length ? 'cobrancas_criadas' : 'sem_cobrancas_ou_configuracao_pendente',
      zapsign_status: 'pendente',
      zapsign_token: null,
      zapsign_url: null,
      raw_zapsign_payload: { provider: 'advos', signature_request_id: signatureRequest.id },
    }).eq('id', generated.id).eq('law_firm_id', profile.law_firm_id);
  }

  await admin.from('activity_logs').insert({
    law_firm_id: profile.law_firm_id,
    auth_user_id: session.user.id,
    action: 'gerou_documento_assinatura_asaas',
    entity: 'generated_contracts',
    entity_id: generated?.id || null,
    metadata: { signature_whatsapp_status: signatureWhatsappStatus },
  });

  const redirectTo = safeInternalPath(data.redirect_to, data.client_id ? `/app/clientes/${data.client_id}?gerado=1` : '/app/clientes?gerado=1');
  return NextResponse.redirect(new URL(redirectTo, req.url), 303);
}
