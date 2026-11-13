import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { mergeExecutionTemplate } from '@/lib/executionTemplate';
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
type Paragraph = { kind:'title'|'heading'|'body'|'citation'|'spacer'|'center'; text:string };
function fullDate(date:string) {
  return new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
}
function cpfPretty(doc:string) {
  const d=doc.replace(/\D/g,'');
  return d.length===11?d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):doc;
}

function underThousand(n:number):string {
  if(n===0)return '';
  const units=['','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
  const teens=['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const tens=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const hundreds=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  if(n===100)return 'cem';
  const out:string[]=[];
  const h=Math.floor(n/100),d=n%100;
  if(h)out.push(hundreds[h]);
  if(d>=10 && d<=19)out.push(teens[d-10]);
  else {
    const t=Math.floor(d/10),u=d%10;
    if(t)out.push(tens[t]);
    if(u)out.push(units[u]);
  }
  return out.join(' e ');
}
function integerInPortuguese(n:number):string {
  if(n===0)return 'zero';
  const parts:string[]=[];
  for(const [scale,singular,plural] of [
    [1000000000,'bilhão','bilhões'],[1000000,'milhão','milhões'],
    [1000,'mil','mil']
  ] as const){
    const q=Math.floor(n/scale);
    if(q){
      const segment=scale===1000 && q===1?'mil':underThousand(q)+' '+(q===1?singular:plural);
      parts.push(segment);
      n%=scale;
    }
  }
  if(n)parts.push(underThousand(n));
  if(parts.length<2)return parts[0]||'zero';
  const last=parts.pop()!;
  return parts.join(' ') + (n<100||n%100===0 ? ' e ' : ' ') + last;
}
function moneyWithWords(cents:number):string {
  const absolute=Math.round(cents);
  const reais=Math.floor(absolute/100),centavos=absolute%100;
  const main=integerInPortuguese(reais)+' '+(reais===1?'real':'reais');
  return formatReal(absolute)+' ('+main+(centavos?' e '+integerInPortuguese(centavos)+' '+(centavos===1?'centavo':'centavos'):'')+')';
}
function totalDate(date:string):string {
  return new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00.000Z'));
}
function renderMatter(matter:ExecutionMatter,calc:ExecutionCalculation):Paragraph[] {
  const paragraphs:Paragraph[]=[];
  const add=(kind:Paragraph['kind'],text:string)=>paragraphs.push({kind,text});
  const c=matter.client;
  const late=calc.lines.filter(x=>x.alreadyDue).length;
  const outstanding=calc.lines.length;
  const future=outstanding-late;
  const status=future===0
    ? late+' '+(late===1?'parcela vencida':'parcelas vencidas')
    : late+' '+(late===1?'parcela vencida':'parcelas vencidas')+' e '+future+' '+(future===1?'parcela a vencer':'parcelas a vencer')+', todas não pagas';
  const qualification='em face do '+c.name.toLocaleUpperCase('pt-BR')+
    ', brasileiro(a), '+c.civil_status+', '+c.profession+
    ', portador da cédula de identidade número '+c.rg+' '+c.rg_uf+
    ', inscrito no CPF sob o número '+cpfPretty(String(c.doc))+
    ', residente e domiciliado na '+c.address+', pelos fatos e fundamentos a seguir expostos:';
  add('title','EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DO ___ JUIZADO ESPECIAL CÍVEL DA COMARCA DE '+matter.comarca.toLocaleUpperCase('pt-BR'));
  add('spacer','');
  add('body','DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA, pessoa jurídica de direito privada, inscrita na Ordem dos Advogados sob o CNPJ número 57.377.637/0001-19, com endereço profissional situado na Rodovia do Sol, Edifício Royal Blue Corporate, no. 2070, Loja 01, Praia de Itaparica, Vila Velha/ES, CEP:29.050-545, com sede na, representada neste ato por sócio administrador Dr, DANIEL COSTA LADEIRA, brasileiro, casado, advogado inscrito na OAB/ES n° 23.416, com endereço profissional a Rodovia do Sol, n °2070, Ed. Royal Blue Corporate, Lj. 01, Praia de Itaparica, Vila Velha/ES, com endereço eletrônico dladadeiradv@gmail.com, vem por intermédio de seu advogado legalmente constituído, vem à presença de Vossa Excelência ajuizar');
  add('title','AÇÃO DE EXECUÇÃO DE TÍTULO EXTRAJUDICIAL');
  add('body',qualification);
  add('heading','1. DA GRATUIDADE DA JUSTIÇA');
  add('body','Em que pese advogando em causa própria, requer a parte Autora o benefício da gratuidade de justiça, nos termos da Legislação Pátria, inclusive para efeito de possível recurso, tendo em vista ser o Autor impossibilitado de arcar com as despesas processuais sem prejuízo próprio e de sua família.');
  add('body','Cabe destacar que a lei não exige atestada miserabilidade da parte que requer a justiça gratuita, a insuficiência de recursos para arcar com as custas de processo e, ainda, honorários advocatícios, é suficiente para a configuração do direito.');
  add('body','Assim, pleiteiam-se os benefícios da Justiça Gratuita, assegurados pela Constituição Federal, artigo 5º, LXXIV e pela Lei 13.105/2015 (CPC), artigo 98 e seguintes, para poder, o Autor, valer-se da garantia constitucional do acesso à justiça e, eventualmente, do duplo grau de jurisdição.');
  add('heading','I – DOS FATOS');
  add('body','A parte autora celebrou contrato de prestação de serviços advocatícios com a parte ré, em '+totalDate(String(c.contract_signed_on))+', conforme documento anexo.');
  add('body','No referido instrumento contratual, as partes pactuaram honorários advocatícios no valor de '+moneyWithWords(Math.round(Number(c.contract_total_amount)*100))+', com condições de pagamento devidamente estipuladas no contrato.');
  add('body','Entretanto, a parte ré deixou de cumprir com sua obrigação de pagamento, possuindo '+status+'.');
  add('body','Importa salientar que o contrato firmado previa sua vigência até o integral cumprimento das obrigações avençadas, podendo ser rescindido por qualquer das partes, a qualquer tempo, desde que mediante aviso prévio, por escrito, com antecedência mínima de 30 (trinta) dias e comprovante de entrega.');
  add('body','No entanto, a parte ré não comunicou qualquer intenção de rescisão contratual, tampouco cumpriu com sua obrigação de pagamento, razão pela qual o contrato permanece válido e em pleno vigor.');
  add('body','Diante do inadimplemento da obrigação contratual, especificamente quanto aos honorários advocatícios pactuados, não restou à parte autora alternativa senão buscar a tutela jurisdicional competente para a cobrança do crédito inadimplido.');
  // Original model: the entire legal reasoning is reproduced verbatim.
  // Only the explicitly variable amount in the conclusion is substituted.
  add('heading','I – DO DIREITO');
  add('body','De largada, cumpre aduzir que o contrato de honorários se trata de título executivo extrajudicial nos termos do art. 24 da Lei 8906/94. Além de prevista na normativa federal, o Superior Tribunal de Justiça já pacificou a temática.');
  add('citation','AGRAVO INTERNO NO AGRAVO EM RECURSO ESPECIAL. CONTRATO DE HONORÁRIOS ADVOCATÍCIOS. TÍTULO EXECUTIVO EXTRAJUDICIAL. RECONHECIMENTO. INEXIGIBILIDADE. AUSÊNCIA. CERTEZA E EXIGIBILIDADE. REVISÃO DE ENTENDIMENTO. NECESSIDADE. REEXAME. ACERVO FÁTICO-PROBATÓRIO. VEDAÇÃO. SÚMULA 7/STJ. AGRAVO IMPROVIDO. 1. A jurisprudência desta Corte é uníssona em reconhecer a prevalência da legislação especial (Lei n. 8.906/1994), que confere ao contrato de prestação de serviços advocatícios a qualidade de título de crédito executivo extrajudicial, independentemente de constar em seu teor a assinatura de duas testemunhas. 2. Rever as conclusões lançadas pela Corte estadual quanto à certeza e exigibilidade do título, demandaria a análise do arcabouço fático-probatório dos autos, providência incabível na via eleita, por esbarrar no óbice da Súmula 7 desta Corte. 3. Agravo interno a que se nega provimento. (STJ - AgInt no AREsp: 1443050 BA 2019/0029308-5, Relator: Ministro MARCO AURÉLIO BELLIZZE, Data de Julgamento: 21/10/2019, T3 - TERCEIRA TURMA, Data de Publicação: DJe 28/10/2019)');
  add('body','Não obstante, a legislação brasileira, em especial o Código Civil, prevê a possibilidade de o credor buscar a satisfação de seu crédito mediante a propositura da ação pertinente.');
  add('citation','ART. 783. A execução para cobrança de crédito fundar-se-á sempre em título de obrigação certa, líquida e exigível.');
  add('citation','ART. 786. A execução pode ser instaurada caso o devedor não satisfaça a obrigação certa, líquida e exigível consubstanciada em título executivo. Ademais, preconiza o artigo 397 do Código Civil:');
  add('citation','ART. 397. O inadimplemento da obrigação, positiva e líquida, no seu termo, constitui de pleno direito em mora o devedor.');
  add('body','Até o presente momento, o(a) Requerido(a) não efetivou o pagamento, estando em mora com o Requerente, conforme disposto no art. 394 e seguintes do Código Civil:');
  add('citation','ART. 394. Considera-se em mora o devedor que não efetuar o pagamento, e o credor que o não quiser receber no tempo, lugar e forma convencionados.');
  add('citation','ART. 389. Não cumprida à obrigação, responde o devedor por perdas e danos, mais juros e atualização monetária segundo índices oficiais regularmente estabelecidos, e honorários de advogado.');
  add('citation','ART. 406. Quando os juros moratórios não forem convencionados, ou o forem sem taxa estipulada, ou quando provierem de determinação da lei, serão fixados segundo a taxa que estiver em vigor para a mora do pagamento de impostos devidos à Fazenda Nacional.');
  add('body','Sendo assim, a legislação brasileira estabelece termos e condições sobre as sanções administrativas a serem aplicadas em caso de inadimplemento como mecanismos de segurança.');
  add('body','No presente caso, tem-se a demonstração do inadimplemento do(a) executado(a) ao deixar de pagar o valor devido, devendo ser condenado ao pagamento corrigido.');
  add('citation','APELAÇÃO CÍVEL. DIREITO PRIVADO NÃO ESPECIFICADO. AÇÃO DE COBRANÇA. ENSINO PARTICULAR. TERMO INICIAL DOS JUROS DE MORA. OS JUROS DE MORA DE 1% DEVEM INCIDIR DESDE O VENCIMENTO DA OBRIGAÇÃO, NA FORMA DO ARTIGO 397 DO CÓDIGO CIVIL. POSSIBILIDADE DE COBRANÇA DE MULTA MORATÓRIA DE 2% SOBRE A PARCELA INADIMPLIDA, POIS EXPRESSAMENTE CONTRATADA. IGUALMENTE POSSÍVEL A INCIDÊNCIA DE CORREÇÃO MONETÁRIA, A FIM DE ATUALIZAR O VALOR DEVIDO. UN NIME. APELO DESPROVIDO. (Apelação Cível Nº 70079685954, Décima Primeira Câmara Cível, Tribunal de Justiça do RS, Relator: Katia Elenise Oliveira da Silva, Julgado em 05/12/2018). (TJ-RS - AC: 70079685954 RS, Relator: Katia Elenise Oliveira da Silva, Data de Julgamento: 05/12/2018, Décima Primeira Câmara Cível, Data de Publicação: Diário da Justiça do dia 10/12/2018)');
  add('body','Trata-se da necessária aplicação da lei, uma vez que demonstrado a inadimplência, outra solução não resta senão o imediato pagamento do débito, conforme amplamente protegido pelo direito.');
  add('body','Em tempo, observa-se que conforme entendimento do STF exarado por meio de súmula vinculante nº 47, os honorários advocatícios possuem natureza alimentar. Vejamos:');
  add('citation','Súmula Vinculante 47 - Os honorários advocatícios incluídos na condenação ou destacados do montante principal devido ao credor consubstanciam verba de natureza alimentar cuja satisfação ocorrerá com a expedição de precatório ou requisição de pequeno valor, observada ordem especial restrita aos créditos dessa natureza.');
  add('body','Assim, considerando-se a tentativa infrutífera de recebimento dos valores devidos por vias administrativas, requer desde logo o pagamento integral do valor final de '+moneyWithWords(calc.amountDueCents)+', mais as despesas com custas judiciais.');
  add('body','Ademais, mesmo diante do inadimplemento reiterado, o Exequente tentou de diversas formas receber os valores devido seja entrando em contato por ligação e mensagens via whatsapp, até tentando marcar reuniões com o Executado que sempre não atendia ou marcava e não comparecia.');
  add('heading','III – DO PEDIDO');
  add('body','Ante o exposto, vem a parte autora requerer de Vossa Excelência:');
  add('body','a) a citação da parte ré, nos moldes do art. 18 da Lei nº 9.099/95, para que compareça a Audiência de Conciliação pré-designada, sob pena dos efeitos da revelia;');
  add('body','b) A concessão da gratuidade da justiça à exequente, inclusive para fins de recurso, nos termos do Art. 98 e seguintes do CPC;');
  add('body','c) julgue totalmente procedente o presente pedido, condenando a parte ré ao pagamento de '+moneyWithWords(calc.amountDueCents)+', todas acrescidas de juros moratórios, multa e correção monetária, além da condenação do réu ao pagamento da multa contratual pela quebra de contrato motivado por si, no previsto em contrato de honorários de '+moneyWithWords(calc.additionalFineCents)+', no total de '+formatReal(calc.totalCents)+'.');
  add('body','d) A condenação do Réu as custas e honorários advocatícios em patamar não inferior a 20% (vinte por cento);');
  add('body','e) Caso o Executado não pague, requer desde já penhora online via BACENJUD, do valor devido, com fulcro no artigo 835, I do CPC;');
  add('body','f) Não sendo encontrados valores no meio acima, requer-se pesquisa, de eventuais ativos, através do sistema RENAJUD e INFOJUD;');
  add('body','g) A inclusão da Executada no Cadastro de Inadimplentes, até que seja adimplida a obrigação, nos moldes do Art. 782 parágrafo 3º do CPC;');
  add('body','Protesta provar o alegado por todos os meios de prova admitidos em Direito.');
  add('body','Dá-se a causa o valor de '+formatReal(calc.totalCents));
  add('body','Termos em que, pede e Espera Deferimento.');
  add('center','Vila Velha/ES, '+totalDate(matter.today)+'.');
  add('center','DANIEL COSTA LADEIRA');
  add('center','OAB/ES 23.416');
  return paragraphs;
}

function xmlEscape(s:string) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function docxParagraph(p:Paragraph) {
  if(p.kind==='spacer')return '<w:p><w:pPr><w:spacing w:before="2700" w:after="180"/></w:pPr></w:p>';
  const alignment=(p.kind==='center'||p.kind==='title')?'center':(p.kind==='heading'?'left':'both');
  const bold=p.kind==='heading'||p.kind==='title';
  const fontSize=p.kind==='citation'?20:24;
  const before=p.kind==='heading'?360:p.kind==='title'?300:160;
  const firstLine=p.kind==='body' ? '<w:ind w:firstLine="720"/>' : p.kind==='citation' ? '<w:ind w:left="2250"/>' : '';
  return '<w:p><w:pPr><w:jc w:val="'+alignment+'"/>'+firstLine+
    '<w:spacing w:before="'+before+'" w:after="200" w:line="300" w:lineRule="auto"/></w:pPr>'+
    '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="'+fontSize+'"/>'+
    (bold?'<w:b/>':'')+'</w:rPr><w:t xml:space="preserve">'+xmlEscape(p.text)+'</w:t></w:r></w:p>';
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
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="'+w+'" xmlns:r="'+rl+'" xmlns:wp="'+wp+'" xmlns:a="'+a+'" xmlns:pic="'+pic+'">'+
    '<w:p><w:pPr><w:jc w:val="right"/></w:pPr>'+logoRun+'</w:p>'+
    '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>LADEIRA ADVOGADOS</w:t></w:r></w:p></w:hdr>';
  const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'+w+'">'+
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="19"/></w:rPr><w:t>Rod. do Sol, 2070. Ed. Royal Blue Corporate, loja 01. Praia de Itaparica,</w:t></w:r></w:p>'+
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="19"/></w:rPr><w:t>Vila Velha – ES. 29102-020. Contato: (27)99794-0089.</w:t></w:r></w:p></w:ftr>';
  const section='<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1740" w:right="1120" w:bottom="1050" w:left="1120" w:header="380" w:footer="480"/></w:sectPr>';
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
  if(logoBytes)try{logo=await doc.embedPng(logoBytes);}catch{/* keep original header text */}
  let page:PDFPage;
  let y:number;
  function startPage(){
    page=doc.addPage([595.28,841.89]);y=742;
    if(logo){
      const h=Math.min(65,90*logo.height/logo.width);
      page.drawImage(logo,{x:445,y:760,width:90,height:h});
      page.drawImage(logo,{x:118,y:200,width:350,height:350*logo.height/logo.width,opacity:0.035});
    }
    page.drawText('LADEIRA ADVOGADOS',{x:416,y:743,font,size:11,color:rgb(0,0,0)});
    const footer1='Rod. do Sol, 2070. Ed. Royal Blue Corporate, loja 01. Praia de Itaparica,';
    const footer2='Vila Velha – ES. 29102-020. Contato: (27)99794-0089.';
    page.drawText(footer1,{x:(595.28-font.widthOfTextAtSize(footer1,9))/2,y:45,font,size:9,color:rgb(0,0,0)});
    page.drawText(footer2,{x:(595.28-font.widthOfTextAtSize(footer2,9))/2,y:32,font,size:9,color:rgb(0,0,0)});
  }
  startPage();
  for(const p of paragraphs) {
    if(p.kind==='spacer'){if(y<230)startPage();else y-=125;continue;}
    const citation=p.kind==='citation';
    const face=(p.kind==='title'||p.kind==='heading')?bold:font;
    const size=citation?10:12;
    const isCentered=p.kind==='center'||p.kind==='title';
    const isHeading=p.kind==='heading';
    const left=citation?170.2:isCentered?55:isHeading?56.8:56.8;
    const firstIndent=p.kind==='body'?36:0;
    const maxRight=542.1;
    const leading=citation?13.2:14.8;
    const gap=(p.kind==='title'?28:isHeading?24:14);
    const words=p.text.replace(/\s+/g,' ').split(' ');
    const lines:string[]=[];
    let line='';
    for(const word of words){
      const trial=line?line+' '+word:word;
      const available=maxRight-left-(lines.length===0?firstIndent:0);
      if(face.widthOfTextAtSize(trial,size)<=available || !line)line=trial;
      else {lines.push(line);line=word;}
    }
    if(line)lines.push(line);
    const estimated=gap+lines.length*leading;
    if(y-estimated<67)startPage();
    y-=gap;
    for(let i=0;i<lines.length;i++){
      if(y<65)startPage();
      const w=face.widthOfTextAtSize(lines[i],size);
      const x=isCentered?Math.max(55,(595.28-w)/2):left+(i===0?firstIndent:0);
      page.drawText(lines[i],{x,y,size,font:face,color:rgb(.04,.04,.04)});
      y-=leading;
    }
  }
  return doc.save();
}

function getLogo():Uint8Array|null {
  try {return new Uint8Array(readFileSync(join(process.cwd(),'public','brand','ladeira-advogados.png')));}catch{return null;}
}
export async function renderExecution(matter:ExecutionMatter,originalTemplate?:Uint8Array) {
  const calc=calculateExecution(matter.installments,matter.today,matter.additionalFineCents);
  const paragraphs=renderMatter(matter,calc);
  const logo=getLogo();
  const docx=originalTemplate?mergeExecutionTemplate(originalTemplate,paragraphs):makeDocx(paragraphs,logo);
  return {docx,pdf:await makePdf(paragraphs,logo),calculation:calc};
}
