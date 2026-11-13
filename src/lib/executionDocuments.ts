import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
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
type Paragraph = {
  kind:'title'|'heading'|'body'|'citation'|'spacer'|'center';
  text:string; spans?:StyledSpan[]; fontSize?:number; leftIndentPt?:number;
  firstIndentPt?:number; beforePt?:number; afterPt?:number;
  lineMultiple?:number; align?:'left'|'center'|'both'|'right';
};
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
  const status=outstanding===late
    ? late+' '+(late===1?'parcela vencida':'parcelas vencidas')
    : late+' '+(late===1?'parcela vencida':'parcelas vencidas')+' e '+outstanding+' parcelas não pagas no total';
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

type RunStyle = { bold?: boolean; italic?: boolean; underline?: boolean; yellow?: boolean };
type StyledSpan = { text: string; style: RunStyle };
const ORIGINAL_YELLOW_QUOTE = 'confere ao contrato de prestação de serviços advocatícios a qualidade de título de crédito executivo extrajudicial, independentemente de constar em seu teor a assinatura de duas testemunhas.';

/** This is the original user's five-page Word template. We update only named placeholders
 * inside w:t nodes and preserve every OOXML part, run format, header, footer and image.
 */
function getOfficialTemplate(): Record<string,Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(join(process.cwd(),
    'src','lib','templates','execucao-modelo-oficial.docx'))));
}
function contractDate(iso:string):string {
  const date=new Date(iso+'T12:00:00.000Z');
  const month=new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(date);
  return date.getUTCDate()+' '+month.charAt(0).toLocaleUpperCase('pt-BR')+month.slice(1)+' '+date.getUTCFullYear();
}
function fillOfficialTemplate(matter:ExecutionMatter, calc:ExecutionCalculation) {
  const archive=getOfficialTemplate();
  const src=archive['word/document.xml'];
  if(!src)throw new Error('Modelo de execução sem documento principal.');
  let xml=strFromU8(src);
  const late=calc.lines.filter(l=>l.alreadyDue).length;
  const unpaid=calc.lines.length;
  const situation=late===unpaid
    ? 'com '+late+' '+(late===1?'parcela vencida':'parcelas vencidas')
    : 'com '+late+' '+(late===1?'parcela vencida':'parcelas vencidas')+
      ', de um total de '+unpaid+' '+(unpaid===1?'parcela não paga':'parcelas não pagas');
  const c=matter.client;
  const values:Record<string,string>={
    COMARCA:matter.comarca.toLocaleUpperCase('pt-BR'),
    NOME:c.name.toLocaleUpperCase('pt-BR'),
    NACIONALIDADE:'brasileiro(a)',
    ESTADO_CIVIL:String(c.civil_status),
    PROFISSAO:String(c.profession),
    RG_COMPLETO:String(c.rg)+' '+String(c.rg_uf),
    CPF:cpfPretty(String(c.doc)),
    ENDERECO:String(c.address),
    DATA_CONTRATO:contractDate(String(c.contract_signed_on)),
    VALOR_CONTRATO_EXTENSO:moneyWithWords(Math.round(Number(c.contract_total_amount)*100)),
    SITUACAO_PARCELAS:situation,
    MONTANTE_EXTENSO:moneyWithWords(calc.amountDueCents),
    MULTA_EXTENSO:moneyWithWords(calc.additionalFineCents),
    VALOR_TOTAL:formatReal(calc.totalCents),
    DATA_ATUAL:fullDate(matter.today),
  };
  for(const [key,value] of Object.entries(values)){
    const needle='{{'+key+'}}';
    if(!xml.includes(needle))throw new Error('Modelo de execução incompleto: '+key);
    xml=xml.split(needle).join(xmlEscape(value));
  }
  if(/\{\{[A-Z_]+\}\}/.test(xml))throw new Error('Modelo com campos variáveis não preenchidos.');
  if(xml.includes('previsto previsto'))throw new Error('Duplicação textual identificada no modelo.');
  archive['word/document.xml']=strToU8(xml);
  return {docx:zipSync(archive,{level:6}),xml,logo:archive['word/media/image1.png']||null,watermark:archive['word/media/image2.png']||null};
}
function decodeWordText(s:string):string{
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&amp;/g,'&')
    .replace(/&#(\d+);/g,(_,n:string)=>String.fromCharCode(Number(n)));
}
/** Read text and run-level typography from the SAME filled DOCX used for the download. */
function paragraphsFromOfficialXml(xml:string):Paragraph[] {
  const blocks=xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)||[];
  return blocks.map(raw=>{
    const props=raw.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/)?.[0]||'';
    const left=Number(props.match(/<w:ind\b[^>]*w:left="(-?\d+)"/)?.[1]||0)/20;
    const first=Number(props.match(/<w:ind\b[^>]*w:firstLine="(-?\d+)"/)?.[1]||0)/20;
    const space=props.match(/<w:spacing\b[^>]*\/>/)?.[0]||'';
    const before=Number(space.match(/w:before="(\d+)"/)?.[1]||0)/20;
    const after=Number(space.match(/w:after="(\d+)"/)?.[1]||0)/20;
    const line=Number(space.match(/w:line="(\d+)"/)?.[1]||240)/240;
    const alignVal=props.match(/<w:jc\b[^>]*w:val="([^"]+)"/)?.[1]||'both';
    const align=(['left','center','both','right'].includes(alignVal)?alignVal:'both') as Paragraph['align'];
    const spans:StyledSpan[]=[];
    let size:number|undefined;
    const runs=raw.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)||[];
    for(const run of runs) {
      const part=run.replace(/<w:tab\s*\/>/g,'<w:t>    </w:t>').replace(/<w:br\s*\/>/g,'<w:t> </w:t>');
      const content=(part.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g)||[])
        .map(t=>decodeWordText(t.replace(/^<w:t\b[^>]*>/,'').replace(/<\/w:t>$/,''))).join('');
      if(!content)continue;
      const rPr=run.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0]||'';
      const rSize=Number(rPr.match(/<w:sz\b[^>]*w:val="(\d+)"/)?.[1]||0)/2;
      if(rSize&&!size)size=rSize;
      const bold=/<w:b(?:\s|\/|>)/.test(rPr)&&!/<w:b\b[^>]*w:val="(?:0|false)"/.test(rPr);
      const italic=/<w:i(?:\s|\/|>)/.test(rPr)&&!/<w:i\b[^>]*w:val="(?:0|false)"/.test(rPr);
      const underline=/<w:u(?:\s|\/|>)/.test(rPr)&&!/<w:u\b[^>]*w:val="none"/.test(rPr);
      const yellow=/<w:shd\b[^>]*w:fill="(?:FFD966|FFFF00)"/i.test(rPr)
        || /<w:highlight\b[^>]*w:val="yellow"/i.test(rPr);
      const style:RunStyle={bold,italic,underline,yellow};
      spans.push({text:content,style});
    }
    let text=spans.map(x=>x.text).join('');
    // The first section number is generated by Word's list numbering.
    if(text==='DA GRATUIDADE DA JUSTIÇA'){text='1. '+text;spans.unshift({text:'1. ',style:{bold:true}});}
    const trimmed=text.trim();
    const heading=/^(?:1\. DA GRATUIDADE|I\s*[–-]\s*DOS FATOS|I\s*[–-]\s*DO DIREITO|III\s*[–-]\s*DO PEDIDO)/.test(trimmed);
    const title=/^(?:EXCELENTÍSSIMO\(A\)|AÇÃO DE EXECUÇÃO DE TÍTULO)/.test(trimmed);
    const citation=!!size && size<=10.5;
    const kind:Paragraph['kind']=!trimmed?'spacer':title?'title':heading?'heading':citation?'citation':align==='center'?'center':'body';
    return {kind,text,spans,fontSize:size||12,leftIndentPt:left,firstIndentPt:first,
      beforePt:before,afterPt:after,lineMultiple:line,align};
  });
}

function styledSpans(p:Paragraph):StyledSpan[] {
  if (p.spans) return p.spans;
  const source=p.text;
  const modifiers:{start:number;end:number;value:RunStyle}[]=[];
  const mark=(needle:string,value:RunStyle)=>{const start=source.indexOf(needle);if(start>=0)modifiers.push({start,end:start+needle.length,value});};
  if(p.kind==='title'||p.kind==='heading')modifiers.push({start:0,end:source.length,value:{bold:true}});
  if(p.kind==='citation'&&source.includes(ORIGINAL_YELLOW_QUOTE))mark(ORIGINAL_YELLOW_QUOTE,{yellow:true});
  if(source.startsWith('DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA')) {
    mark('DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA',{bold:true});
    mark('representada neste ato por sócio administrador Dr, DANIEL COSTA LADEIRA',{bold:true});
  }
  if(source.startsWith('em face do ')) {
    const start='em face do '.length; const end=source.indexOf(',',start);
    if(end>start)modifiers.push({start,end,value:{bold:true}});
  }
  if(source.includes('c) julgue totalmente procedente')) {
    const values=source.match(/R\$\s?[0-9][0-9.,]*/g)||[];
    if(values.length){mark(values[0],{bold:true});mark(values[values.length-1],{bold:true});}
  }
  if(source==='DANIEL COSTA LADEIRA')modifiers.push({start:0,end:source.length,value:{bold:true}});
  if(!modifiers.length)return [{text:source,style:{}}];
  const points=Array.from(new Set([0,source.length,...modifiers.flatMap(m=>[m.start,m.end])])).sort((a,b)=>a-b);
  const spans:StyledSpan[]=[];
  for(let i=0;i+1<points.length;i++){
    const a=points[i],b=points[i+1];if(a===b)continue;
    const style:RunStyle={};
    for(const mod of modifiers)if(mod.start<=a && mod.end>=b)Object.assign(style,mod.value);
    const text=source.slice(a,b);
    if(text)spans.push({text,style});
  }
  return spans;
}
function isSectionHeading(p:Paragraph) {
  return p.kind==='heading' && /^(?:I|II|III|IV)\s*[–-]\s*(?:DOS FATOS|DO DIREITO|DO PEDIDO)$/.test(p.text);
}
function docxParagraph(p:Paragraph) {
  if(p.kind==='spacer')return '<w:p><w:pPr><w:spacing w:before="2600" w:after="200"/></w:pPr></w:p>';
  const isHeading=p.kind==='heading';
  const isCitation=p.kind==='citation';
  const align=p.kind==='center'||p.kind==='title'?'center':isHeading?'left':'both';
  const before=p.kind==='title'?240:isHeading?240:isCitation?60:180;
  const after=p.kind==='title'?240:isHeading?320:isCitation?40:200;
  const line=isCitation?276:240;
  const indent=isCitation?'<w:ind w:left="2268"/>':p.kind==='body'?'<w:ind w:firstLine="720"/>':'';
  const border=isSectionHeading(p)?'<w:pBdr><w:bottom w:val="single" w:sz="5" w:space="1" w:color="808080"/></w:pBdr>':'';
  const size=isCitation?20:24; // Arial 10pt citations, Arial 12pt text, exactly as the source.
  const runs=styledSpans(p).map(({text,style})=>{
    const rPr='<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/>'+
      (style.bold?'<w:b/><w:bCs/>':'')+
      (style.italic?'<w:i/><w:iCs/>':'')+
      (style.underline?'<w:u w:val="single"/>':'')+
      (style.yellow?'<w:shd w:val="clear" w:color="auto" w:fill="FFD966"/>':'')+
      '</w:rPr>';
    return '<w:r>'+rPr+'<w:t xml:space="preserve">'+xmlEscape(text)+'</w:t></w:r>';
  }).join('');
  return '<w:p><w:pPr><w:jc w:val="'+align+'"/>'+indent+border+
    '<w:spacing w:before="'+before+'" w:after="'+after+'" w:line="'+line+'" w:lineRule="auto"/></w:pPr>'+
    runs+'</w:p>';
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
async function makePdf(paragraphs:Paragraph[], logoBytes:Uint8Array|null, watermarkBytes:Uint8Array|null) {
  const doc=await PDFDocument.create();
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const italic=await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic=await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const choose=(s:RunStyle):PDFFont => s.bold?(s.italic?boldItalic:bold):(s.italic?italic:regular);
  let logo:PDFImage|null=null;
  let watermark:PDFImage|null=null;
  if(logoBytes)try{logo=await doc.embedPng(logoBytes);}catch{/* fallback */}
  if(watermarkBytes)try{watermark=await doc.embedPng(watermarkBytes);}catch{/* fallback */}
  const pageWidth=595.28, pageHeight=841.89;
  let page:PDFPage;
  let y:number;
  const createPage=()=>{
    page=doc.addPage([pageWidth,pageHeight]);y=746;
    // Header, watermark and two-line footer from the supplied document.
    if(logo) {
      const headerH=Math.min(65,90*logo.height/logo.width);
      page.drawImage(logo,{x:445,y:762,width:90,height:headerH});
    }
    if(watermark) {
      const watermarkW=535;
      page.drawImage(watermark,{x:29,y:90,width:watermarkW,
        height:watermarkW*watermark.height/watermark.width,opacity:0.08});
    }
    page.drawText('LADEIRA ADVOGADOS',{x:411,y:744,font:italic,size:11,color:rgb(0,0,0)});
    const f1='Rod. do Sol, 2070. Ed. Royal Blue Corporate, loja 01. Praia de Itaparica,';
    const f2='Vila Velha – ES. 29102-020. Contato: (27)99794-0089.';
    page.drawText(f1,{x:(pageWidth-regular.widthOfTextAtSize(f1,9))/2,y:43,font:regular,size:9});
    page.drawText(f2,{x:(pageWidth-regular.widthOfTextAtSize(f2,9))/2,y:30,font:regular,size:9});
  };
  createPage();
  type StyledToken={text:string;style:RunStyle;width:number};
  for(const p of paragraphs) {
    if(p.kind==='spacer'){if(y<92)createPage();else y-=Math.max(10,(p.beforePt||0)+12);continue;}
    const quote=p.kind==='citation';
    const title=p.kind==='title';
    const heading=p.kind==='heading';
    const center=p.align==='center'||title||p.kind==='center';
    const left=56.7+(p.leftIndentPt??(quote?113:0));
    const right=538.6;
    const indent=p.firstIndentPt??(p.kind==='body'?36:0);
    const fontSize=p.fontSize|| (quote?10:12);
    const leading=fontSize*Math.max(1,p.lineMultiple||1.15);
    const before=p.beforePt??(title?19:heading?23:quote?7:12);
    const after=p.afterPt??(title?19:heading?14:quote?6:10);
    const tokens:StyledToken[]=[];
    for(const span of styledSpans(p)) {
      const pieces=span.text.replace(/\s+/g,' ').split(/( +)/g).filter(Boolean);
      for(const piece of pieces)tokens.push({
        text:piece,style:span.style,width:choose(span.style).widthOfTextAtSize(piece,fontSize),
      });
    }
    const available=right-left;
    const lines:StyledToken[][]=[];
    let current:StyledToken[]=[];
    let width=0;
    for(const token of tokens){
      if(!current.length && !token.text.trim())continue;
      const max=available-(lines.length===0?indent:0);
      if(current.length && width+token.width>max && token.text.trim()){
        while(current.length && !current[current.length-1].text.trim()){
          width-=current[current.length-1].width;current.pop();
        }
        if(current.length)lines.push(current);
        current=[];width=0;
      }
      if(!current.length && !token.text.trim())continue;
      current.push(token);width+=token.width;
    }
    while(current.length&&!current[current.length-1].text.trim())current.pop();
    if(current.length)lines.push(current);
    if(!lines.length)continue;
    if(y-before-lines.length*leading-after<70)createPage();
    y-=before;
    for(let n=0;n<lines.length;n++) {
      if(y<67)createPage();
      const row=lines[n];
      const rawWidth=row.reduce((sum,t)=>sum+t.width,0);
      const rowIndent=n===0?indent:0;
      const rowAvailable=available-rowIndent;
      const spaces=row.filter(t=>/^ +$/.test(t.text)).reduce((count,t)=>count+t.text.length,0);
      const justify=!center&&!heading&&n!==lines.length-1&&spaces>0;
      const extra=justify?Math.max(0,(rowAvailable-rawWidth)/spaces):0;
      let x=center?Math.max(left,(pageWidth-rawWidth)/2):left+rowIndent;
      for(const part of row){
        const font=choose(part.style);
        const actualWidth=part.width+(justify&&/^ +$/.test(part.text)?extra*part.text.length:0);
        if(part.style.yellow&&part.text.trim())page.drawRectangle({
          x,y:y-3,width:part.width,height:fontSize+3,
          color:rgb(1,217/255,102/255),
        });
        if(part.text.trim())page.drawText(part.text,{x,y,font,size:fontSize,color:rgb(.04,.04,.04)});
        if(part.style.underline&&part.text.trim())page.drawLine({
          start:{x,y:y-2},end:{x:x+part.width,y:y-2},thickness:.6,
          color:rgb(.04,.04,.04),
        });
        x+=actualWidth;
      }
      if(isSectionHeading(p)&&n===lines.length-1)page.drawLine({
        start:{x:56.7,y:y-3.5},end:{x:538.6,y:y-3.5},
        thickness:.45,color:rgb(.4,.4,.4),
      });
      y-=leading;
    }
    y-=after;
  }
  return doc.save();
}
function getLogo():Uint8Array|null {
  try {return new Uint8Array(readFileSync(join(process.cwd(),'public','brand','ladeira-advogados.png')));}catch{return null;}
}
export async function renderExecution(matter:ExecutionMatter) {
  const calc=calculateExecution(matter.installments,matter.today,matter.additionalFineCents);
  const filled=fillOfficialTemplate(matter,calc);
  const paragraphs=paragraphsFromOfficialXml(filled.xml);
  return {docx:filled.docx,pdf:await makePdf(paragraphs,filled.logo,filled.watermark),calculation:calc};
}
