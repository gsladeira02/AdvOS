import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function str(v: FormDataEntryValue | null) {
  return String(v || '').trim();
}

function money(value: string) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(value?: string) {
  if (!value) return new Date().toLocaleDateString('pt-BR');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  }
  return value;
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function p(text: string) {
  return `<p>${escapeHtml(text)}</p>`;
}

function br(value: string) {
  return escapeHtml(value || '-');
}

function titleFor(type: string) {
  if (type === 'procuracao_hipossuficiencia') return 'PROCURAÇÃO E DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA';
  if (type === 'procuracao_simples') return 'PROCURAÇÃO';
  if (type === 'kit_hipossuficiencia') return 'CONTRATO DE HONORÁRIOS, PROCURAÇÃO E HIPOSSUFICIÊNCIA';
  if (type === 'kit_simples') return 'CONTRATO DE HONORÁRIOS E PROCURAÇÃO';
  return 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS';
}

function filenameFor(type: string, clientName: string) {
  const safeName = (clientName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
  const prefix = type.includes('procuracao') ? 'procuracao' : type.includes('kit') ? 'kit-contrato-procuracao' : 'contrato-honorarios';
  return `${prefix}-${safeName || 'cliente'}.doc`;
}

function qualification(data: Record<string, string>) {
  const parts = [
    data.client_name,
    data.civil_status,
    data.profession,
    data.rg ? `portador(a) do RG nº ${data.rg}${data.rg_uf ? `/${data.rg_uf}` : ''}` : '',
    data.cpf ? `inscrito(a) no CPF sob nº ${data.cpf}` : '',
    data.address ? `residente e domiciliado(a) em ${data.address}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function contractHtml(data: Record<string, string>) {
  const installments = Number(data.installment_count || 0);
  const paymentText = installments > 0
    ? `O valor restante será pago em ${installments} parcela(s) de ${money(data.installment_amount)}, com vencimento todo dia ${data.due_day || '-'} de cada mês.`
    : 'Não foram informadas parcelas futuras.';

  return `
    <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS</h1>
    ${p(`CONTRATANTE: ${qualification(data)}.`)}
    ${p(`CONTRATADO(S): ${data.attorneys || 'advogado(s) e/ou escritório de advocacia indicado(s) pelo contratante'}, doravante denominado(s) CONTRATADO(S).`)}
    <h2>1. Objeto</h2>
    ${p(`O presente contrato tem por objeto a prestação de serviços advocatícios para ${data.object || 'atuação administrativa e/ou judicial de interesse do(a) contratante'}.`)}
    <h2>2. Honorários</h2>
    ${p(`Pelos serviços contratados, o(a) CONTRATANTE pagará honorários no valor total de ${money(data.total_amount)}.`)}
    ${p(`Entrada: ${money(data.entry_amount)}, com vencimento em ${dateBR(data.entry_date)}.`)}
    ${p(paymentText)}
    ${data.payment_notes ? p(`Observações de pagamento: ${data.payment_notes}.`) : ''}
    <h2>3. Despesas e custas</h2>
    ${p('Custas, taxas, deslocamentos, cópias, autenticações, emolumentos, diligências, protocolos e demais despesas necessárias ao andamento do serviço não estão incluídos nos honorários, salvo ajuste escrito em sentido contrário.')}
    <h2>4. Obrigações do contratante</h2>
    ${p('O(a) CONTRATANTE compromete-se a fornecer informações verdadeiras, documentos solicitados, comprovantes e dados necessários ao desempenho dos serviços, bem como manter seus contatos atualizados.')}
    <h2>5. Obrigações do contratado</h2>
    ${p('O(s) CONTRATADO(S) compromete(m)-se a atuar com zelo profissional, técnica, sigilo e diligência, mantendo o(a) CONTRATANTE informado(a) sobre os atos relevantes.')}
    <h2>6. Rescisão</h2>
    ${p('A rescisão não afasta a obrigação de pagamento dos honorários vencidos, despesas já realizadas e serviços efetivamente prestados até a data do encerramento da contratação.')}
    <h2>7. Foro</h2>
    ${p(`As partes elegem o foro de ${data.local || 'Vila Velha/ES'} para dirimir controvérsias decorrentes deste instrumento, salvo regra legal de competência absoluta.`)}
    <div class="signature-block">
      <p>${br(data.local)}, ${dateBR(data.contract_date)}.</p>
      <p>__________________________________________<br/>${br(data.client_name)}<br/>CONTRATANTE</p>
      <p>__________________________________________<br/>${br(data.attorneys || 'CONTRATADO(S)')}<br/>CONTRATADO(S)</p>
    </div>
  `;
}

function powerOfAttorneyHtml(data: Record<string, string>, withHipossuficiencia: boolean) {
  return `
    <h1>${withHipossuficiencia ? 'PROCURAÇÃO E DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA' : 'PROCURAÇÃO'}</h1>
    <h2>Outorgante</h2>
    ${p(`${qualification(data)}.`)}
    <h2>Outorgado(s)</h2>
    ${p(`${data.attorneys || 'advogado(s) e/ou escritório de advocacia indicado(s) pelo outorgante'}.`)}
    <h2>Poderes</h2>
    ${p('Pelo presente instrumento particular de procuração, o(a) OUTORGANTE nomeia e constitui seu(s) bastante(s) procurador(es) o(s) OUTORGADO(S) acima indicado(s), conferindo-lhes poderes para representá-lo(a) perante órgãos públicos, autarquias, repartições administrativas, DETRAN, CIRETRAN, JARI, CETRAN, Polícia Rodoviária, Poder Judiciário, Ministério Público, Defensoria Pública e demais órgãos competentes.')}
    ${p(`Os poderes abrangem a prática de todos os atos necessários para ${data.object || 'defesa de interesses administrativos e/ou judiciais'}, podendo requerer, protocolar, acompanhar processos, apresentar defesas e recursos, juntar e retirar documentos, solicitar cópias, obter informações, assinar requerimentos, substabelecer com ou sem reserva de poderes e praticar os demais atos necessários ao fiel cumprimento deste mandato.`)}
    ${p('Confere ainda poderes da cláusula ad judicia et extra, inclusive para receber citações, intimações e notificações, confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos, receber e dar quitação, nos limites legais e mediante orientação profissional.')}
    ${withHipossuficiencia ? `
      <h2>Declaração de hipossuficiência econômica</h2>
      ${p('O(a) OUTORGANTE declara, sob as penas da lei, que não possui condições financeiras de arcar com custas, despesas processuais, emolumentos e demais encargos sem prejuízo de seu sustento próprio e/ou de sua família, razão pela qual requer, quando cabível, os benefícios da gratuidade da justiça.')}
      ${p('Declara estar ciente de que a veracidade das informações prestadas poderá ser analisada pela autoridade competente e que documentos adicionais poderão ser solicitados.')}
    ` : ''}
    <div class="signature-block">
      <p>${br(data.local)}, ${dateBR(data.contract_date)}.</p>
      <p>__________________________________________<br/>${br(data.client_name)}<br/>OUTORGANTE</p>
    </div>
  `;
}

function buildBody(data: Record<string, string>) {
  const type = data.document_type;
  if (type === 'procuracao_simples') return powerOfAttorneyHtml(data, false);
  if (type === 'procuracao_hipossuficiencia') return powerOfAttorneyHtml(data, true);
  if (type === 'kit_simples') return `${contractHtml(data)}<div class="page-break"></div>${powerOfAttorneyHtml(data, false)}`;
  if (type === 'kit_hipossuficiencia') return `${contractHtml(data)}<div class="page-break"></div>${powerOfAttorneyHtml(data, true)}`;
  return contractHtml(data);
}

function buildHtml(data: Record<string, string>) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titleFor(data.document_type))}</title>
<style>
  @page { size: A4; margin: 2.5cm 2.2cm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12pt; line-height: 1.55; }
  h1 { text-align: center; font-size: 15pt; margin: 0 0 26px; text-transform: uppercase; }
  h2 { font-size: 12.5pt; margin: 20px 0 8px; }
  p { text-align: justify; margin: 0 0 12px; }
  .signature-block { margin-top: 48px; text-align: center; }
  .signature-block p { text-align: center; margin-top: 30px; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
${buildBody(data)}
</body>
</html>`;
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentProfile();
  const f = await req.formData();
  const data: Record<string, string> = {
    document_type: str(f.get('document_type')) || 'contrato_honorarios',
    client_id: str(f.get('client_id')),
    case_id: str(f.get('case_id')),
    client_name: str(f.get('client_name')),
    civil_status: str(f.get('civil_status')),
    profession: str(f.get('profession')),
    rg: str(f.get('rg')),
    rg_uf: str(f.get('rg_uf')),
    cpf: str(f.get('cpf')),
    address: str(f.get('address')),
    phone: str(f.get('phone')),
    email: str(f.get('email')),
    local: str(f.get('local')) || 'Vila Velha/ES',
    contract_date: str(f.get('contract_date')) || new Date().toISOString().slice(0, 10),
    object: str(f.get('object')),
    attorneys: str(f.get('attorneys')),
    total_amount: str(f.get('total_amount')),
    entry_amount: str(f.get('entry_amount')),
    entry_date: str(f.get('entry_date')),
    installment_count: str(f.get('installment_count')),
    installment_amount: str(f.get('installment_amount')),
    due_day: str(f.get('due_day')),
    payment_notes: str(f.get('payment_notes')),
  };

  const html = buildHtml(data);
  const admin = createAdminSupabase();
  await admin.from('generated_contracts').insert({
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
    total_amount: Number(data.total_amount || 0),
    entry_amount: Number(data.entry_amount || 0),
    entry_date: data.entry_date || null,
    installment_count: Number(data.installment_count || 0),
    installment_amount: Number(data.installment_amount || 0),
    due_day: data.due_day ? Number(data.due_day) : null,
    has_hypo: ['procuracao_hipossuficiencia', 'kit_hipossuficiencia'].includes(data.document_type),
  });

  const filename = filenameFor(data.document_type, data.client_name);
  return new Response(Buffer.from(html, 'utf8'), {
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
