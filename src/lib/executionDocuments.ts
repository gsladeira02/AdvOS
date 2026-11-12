import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage, type PDFFont } from 'pdf-lib';
import {
  calculateExecution, formatReal, formatBRDate, type ExecutionCalculation,
  type ExecutionClient, type ExecutionInstallment,
} from '@/lib/executionShared';

export type ExecutionMatter = {
  client: ExecutionClient;
  installments: ExecutionInstallment[];
  today: string;
  comarca: string;
  additionalFineCents: number;
  accelerationConfirmed: boolean;
};
type Paragraph = { kind:'title'|'heading'|'body'|'memo'|'center'; text:string };
function fullDate(date:string) {
  return new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
}
function cpfPretty(doc:string) {
  const d=doc.replace(/\D/g,'');
  return d.length===11?d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):doc;
}
function renderMatter(matter:ExecutionMatter, calc:ExecutionCalculation): Paragraph[] {
  const b:Paragraph[]=[];
  const add=(kind:Paragraph['kind'],text:string)=>b.push({kind,text});
  const c=matter.client;
  const future=calc.lines.filter(x=>!x.alreadyDue);
  const overdue=calc.lines.filter(x=>x.alreadyDue);
  add('title','EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DO ___ JUIZADO ESPECIAL CÍVEL DA COMARCA DE '+matter.comarca.toLocaleUpperCase('pt-BR'));
  add('body','DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA, pessoa jurídica de direito privado, inscrita no CNPJ nº 57.377.637/0001-19, com endereço profissional na Rodovia do Sol, nº 2070, Edifício Royal Blue Corporate, Loja 01, Praia de Itaparica, Vila Velha/ES, representada por seu sócio Dr. DANIEL COSTA LADEIRA, advogado inscrito na OAB/ES nº 23.416, vem, respeitosamente, ajuizar');
  add('title','AÇÃO DE EXECUÇÃO DE TÍTULO EXTRAJUDICIAL');
  add('body','em face de '+c.name.toLocaleUpperCase('pt-BR')+', natural de '+c.naturalidade+', '+c.civil_status+', '+c.profession+', portador(a) do RG nº '+c.rg+' ('+c.rg_uf+'), CPF nº '+cpfPretty(String(c.doc))+', residente e domiciliado(a) em '+c.address+', pelos fatos e fundamentos a seguir expostos.');
  add('heading','1. DA GRATUIDADE DA JUSTIÇA');
  add('body','A parte Exequente requer a apreciação da gratuidade da justiça, caso comprovados os pressupostos previstos na Constituição Federal, art. 5º, LXXIV, e no Código de Processo Civil, art. 98 e seguintes, como formulado no documento de referência.');
  add('heading','I - DOS FATOS');
  add('body','A Exequente celebrou contrato de prestação de serviços advocatícios com a parte Executada em '+fullDate(String(c.contract_signed_on))+', conforme o instrumento firmado entre as partes, que deve instruir a demanda.');
  add('body','No contrato, foram pactuados honorários no valor total de '+formatReal(Math.round(Number(c.contract_total_amount)*100))+', com pagamento em '+c.contract_installment_count+' parcela(s) e demais condições previstas no instrumento.');
  add('body','Até '+fullDate(matter.today)+', foram identificadas '+overdue.length+' parcela(s) vencida(s) e não paga(s). Há '+future.length+' parcela(s) ainda não vencida(s) e não quitada(s), também incluídas neste demonstrativo como saldo contratual remanescente'+(future.length?', mediante a hipótese de vencimento antecipado que deverá ser conferida à luz da cláusula contratual aplicável.':'.'));
  add('body','Os valores abaixo consideram exclusivamente prestações não pagas, excluindo parcelas quitadas e canceladas. A cobrança de prestações originalmente vincendas exige confirmação de sua exigibilidade antecipada.');
  add('heading','II - DO DIREITO');
  add('body','O contrato escrito de honorários advocatícios constitui título executivo extrajudicial, nos termos do art. 24 da Lei nº 8.906/1994. A execução exige obrigação certa, líquida e exigível, conforme os arts. 783 e 786 do Código de Processo Civil.');
  if(future.length) add('body','O pedido de inclusão de prestações vincendas se funda no vencimento antecipado estipulado contratualmente, cuja existência, extensão e exigibilidade deverão ser verificadas no título antes do protocolo. Não se afirma mora sobre parcelas cuja data original de vencimento ainda não transcorreu.');
  add('heading','MEMÓRIA DISCRIMINADA DE CÁLCULO');
  add('memo','Data-base: '+formatBRDate(matter.today)+'. Juros simples de 5% ao mês, proporcionais aos dias corridos de atraso/30, apenas para parcelas originalmente vencidas. Acréscimo fixo de 10% sobre cada parcela remanescente, sujeito à previsão contratual.');
  calc.lines.forEach((line,i)=>add('memo','Parcela '+(i+1)+' — '+(line.alreadyDue?'vencida':'vincenda, antecipada')+' em '+formatBRDate(line.due_date)+' — principal '+formatReal(line.principalCents)+'; dias de atraso '+line.daysLate+'; juros '+formatReal(line.interestCents)+'; 10% fixos '+formatReal(line.surchargeCents)+'; total '+formatReal(line.totalCents)+'.'));
  add('memo','Principal do saldo remanescente: '+formatReal(calc.principalCents));
  add('memo','Juros simples (5% a.m.) sobre prestações vencidas: '+formatReal(calc.interestCents));
  add('memo','Acréscimo fixo de 10% por parcela remanescente: '+formatReal(calc.surchargeCents));
  add('memo','MONTANTE DEVEDOR: '+formatReal(calc.amountDueCents));
  add('memo','Multa contratual adicional: '+formatReal(calc.additionalFineCents));
  add('memo','MONTANTE + MULTA / VALOR DA CAUSA: '+formatReal(calc.totalCents));
  add('heading','III - DO PEDIDO');
  add('body','Diante do exposto, requer:');
  add('body','a) a citação da parte Executada pelos meios processuais aplicáveis, para o cumprimento da obrigação ou oferecimento das medidas defensivas cabíveis;');
  add('body','b) a apreciação do pedido de gratuidade da justiça, se comprovados os requisitos legais;');
  add('body','c) a satisfação do montante devedor de '+formatReal(calc.amountDueCents)+', acrescido da multa contratual adicional de '+formatReal(calc.additionalFineCents)+', perfazendo o valor de '+formatReal(calc.totalCents)+', de acordo com a memória de cálculo e respeitados os limites legais e contratuais;');
  if(future.length)add('body','d) o reconhecimento, após conferência do contrato anexo, da exigibilidade antecipada das '+future.length+' parcela(s) originalmente vincenda(s) incluída(s) no saldo remanescente;');
  add('body','e) na ausência de pagamento, a adoção das medidas executivas e pesquisas patrimoniais juridicamente cabíveis, inclusive SISBAJUD e, quando pertinentes, RENAJUD e INFOJUD;');
  add('body','f) os demais consectários processuais previstos em lei, quando aplicáveis ao rito e à competência escolhidos.');
  add('body','Protesta provar o alegado por todos os meios de prova admitidos em Direito, especialmente contrato assinado, histórico dos pagamentos e demonstrativo atualizado do débito.');
  add('body','Dá-se à causa o valor de '+formatReal(calc.totalCents)+'.');
  add('body','Termos em que pede deferimento.');
  add('center','Vila Velha/ES, '+fullDate(matter.today)+'.');
  add('center','DANIEL COSTA LADEIRA');
  add('center','OAB/ES 23.416');
  return b;
}
function xmlEscape(s:string) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function docxParagraph(p:Paragraph) {
  const alignment=p.kind==='center'||p.kind==='title'?'center':'both';
  const bold=p.kind==='heading'||p.kind==='title';
  const fontSize=p.kind==='title'?23:p.kind==='memo'?18:21;
  const before=p.kind==='title'?420:p.kind==='heading'?270:60;
  return '<w:p><w:pPr><w:jc w:val="'+alignment+'"/><w:spacing w:before="'+before+'" w:after="180" w:line="310" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="'+fontSize+'"/>'+(bold?'<w:b/>':'')+'</w:rPr><w:t xml:space="preserve">'+xmlEscape(p.text)+'</w:t></w:r></w:p>';
}
function makeDocx(paragraphs:Paragraph[], logo:Uint8Array|null) {
  const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rl='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pic='http://schemas.openxmlformats.org/drawingml/2006/picture';
  const a='http://schemas.openxmlformats.org/drawingml/2006/main';
  const wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  let logoRun='<w:r><w:rPr><w:b/></w:rPr><w:t>LADEIRA ADVOGADOS</w:t></w:r>';
  if(logo){
    logoRun='<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="980000" cy="700000"/><wp:docPr id="1" name="Logotipo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="ladeira.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="980000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="'+w+'" xmlns:r="'+rl+'" xmlns:wp="'+wp+'" xmlns:a="'+a+'" xmlns:pic="'+pic+'"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>'+logoRun+'</w:p></w:hdr>';
  const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'+w+'"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>Rod. do Sol, 2070, Ed. Royal Blue Corporate, Loja 01, Praia de Itaparica, Vila Velha/ES. Contato: (27) 99794-0089.</w:t></w:r></w:p></w:ftr>';
  const section='<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1550" w:right="1250" w:bottom="1300" w:left="1250" w:header="440" w:footer="500"/></w:sectPr>';
  const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+w+'" xmlns:r="'+rl+'"><w:body>'+paragraphs.map(docxParagraph).join('')+section+'</w:body></w:document>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>';
  const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  const imageRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>';
  const files:Record<string,Uint8Array>={
    '[Content_Types].xml':strToU8(types),'_rels/.rels':strToU8(rootRels),
    'word/document.xml':strToU8(document),'word/_rels/document.xml.rels':strToU8(docRels),
    'word/header1.xml':strToU8(header),'word/footer1.xml':strToU8(footer),
  };
  if(logo){files['word/media/logo.png']=logo;files['word/_rels/header1.xml.rels']=strToU8(imageRels);}
  return zipSync(files,{level:6});
}
async function makePdf(paragraphs:Paragraph[], logoBytes:Uint8Array|null) {
  const doc=await PDFDocument.create();
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let logo:PDFImage|null=null;
  if(logoBytes){try{logo=await doc.embedPng(logoBytes);}catch{/* fallback to text header */}}
  let page:PDFPage;
  let y:number;
  function startPage() {
    page=doc.addPage([595.28,841.89]); y=760;
    page.drawText('LADEIRA ADVOGADOS',{x:54,y:814,font:bold,size:9,color:rgb(.16,.18,.18)});
    if(logo){const h=Math.min(44,100*logo.height/logo.width);page.drawImage(logo,{x:438,y:780,width:100,height:h});}
    page.drawLine({start:{x:52,y:774},end:{x:543,y:774},thickness:.6,color:rgb(.78,.78,.78)});
    page.drawLine({start:{x:52,y:49},end:{x:543,y:49},thickness:.6,color:rgb(.80,.80,.80)});
    page.drawText('Rod. do Sol, 2070, Ed. Royal Blue Corporate, Loja 01, Praia de Itaparica, Vila Velha/ES.',{x:72,y:35,font,size:7.6,color:rgb(.35,.35,.35)});
    page.drawText('Contato: (27) 99794-0089.',{x:223,y:23,font,size:7.5,color:rgb(.35,.35,.35)});
  }
  startPage();
  for(const p of paragraphs) {
    const face=p.kind==='title'||p.kind==='heading'?bold:font;
    const size=p.kind==='title'?11:p.kind==='memo'?9.1:10.2;
    const gap=p.kind==='title'?20:p.kind==='heading'?16:8;
    const leading=p.kind==='memo'?12.2:14;
    const words=p.text.replace(/\s+/g,' ').split(' ');
    const lines:string[]=[];
    let line='';
    for(const word of words) {
      const attempt=line?line+' '+word:word;
      if(face.widthOfTextAtSize(attempt,size)<=490||!line)line=attempt;
      else {lines.push(line);line=word;}
    }
    if(line)lines.push(line);
    if(y-gap-lines.length*leading<70)startPage();
    y-=gap;
    for(const lineText of lines) {
      if(y<69)startPage();
      const width=face.widthOfTextAtSize(lineText,size);
      const x=p.kind==='center'||p.kind==='title'?Math.max(52,(595.28-width)/2):53;
      page.drawText(lineText,{x,y,size,font:face,color:rgb(.08,.09,.10)});
      y-=leading;
    }
  }
  return doc.save();
}
function getLogo():Uint8Array|null {
  try {return new Uint8Array(readFileSync(join(process.cwd(),'public','brand','ladeira-advogados.png')));}catch{return null;}
}
export async function renderExecution(matter:ExecutionMatter) {
  const calc=calculateExecution(matter.installments,matter.today,matter.additionalFineCents);
  const paragraphs=renderMatter(matter,calc);
  const logo=getLogo();
  return {docx:makeDocx(paragraphs,logo),pdf:await makePdf(paragraphs,logo),calculation:calc};
}
