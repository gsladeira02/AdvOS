import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** Preserva as partes OOXML do arquivo Word original (estilos, cabeçalho,
 * rodapé, imagens, marca d'água, fonte, parágrafos, ênfases e realces). */
export const EXECUTION_TEMPLATE_NAME = 'Modelo oficial de execução judicial (DOCX)';
type GeneratedParagraph = {text:string};

function decodeXml(value:string):string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,(entity,body:string)=>{
    const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(body[0]==='#'){
      const code=body[1]?.toLowerCase()==='x'?parseInt(body.slice(2),16):parseInt(body.slice(1),10);
      return Number.isInteger(code)&&code>=0&&code<=0x10ffff?String.fromCodePoint(code):entity;
    }
    return named[body.toLowerCase()]??entity;
  });
}
function encodeXml(value:string):string {
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
const textNode=/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
function paragraphText(xml:string):string {
  return Array.from(xml.matchAll(textNode),m=>decodeXml(m[1])).join('');
}
/** Substitui spans entre runs conservando todas as propriedades dos runs. */
function replaceText(xml:string,target:string,value:string):string {
  if(!target||target===value)return xml;
  const nodes=Array.from(xml.matchAll(textNode),m=>({text:decodeXml(m[1])}));
  const full=nodes.map(x=>x.text).join('');
  const start=full.indexOf(target);
  if(start<0)throw new Error('Trecho ausente no modelo: '+target.slice(0,45));
  const end=start+target.length;
  let offset=0;
  const range=nodes.map(x=>{const n={start:offset,end:offset+x.text.length};offset=n.end;return n;});
  const first=range.findIndex(n=>n.end>start);
  const last=range.findIndex(n=>n.end>=end);
  if(first<0||last<0)throw new Error('Não foi possível substituir o texto no modelo.');
  const result=nodes.map(x=>x.text);
  result[first]=nodes[first].text.slice(0,start-range[first].start)+value+
    (first===last?nodes[first].text.slice(end-range[first].start):'');
  if(first!==last){
    for(let i=first+1;i<last;i++)result[i]='';
    result[last]=nodes[last].text.slice(end-range[last].start);
  }
  let n=0;
  return xml.replace(textNode,(match,inner:string)=>match.replace(inner,encodeXml(result[n++])));
}
function generated(lines:GeneratedParagraph[],prefix:string):string {
  const line=lines.find(x=>x.text.startsWith(prefix));
  if(!line)throw new Error('Texto variável ausente: '+prefix);
  return line.text;
}
const moneyNums=(s:string)=>Array.from(s.matchAll(/R\$\s*[0-9][0-9.,]*[0-9]/g),m=>m[0]);
const moneyWords=(s:string)=>Array.from(s.matchAll(/\([^()]*\b(?:real|reais)\b[^()]*\)/g),m=>m[0]);

function unzipTemplate(template:Uint8Array):Record<string,Uint8Array> {
  if(template.byteLength<1000||template.byteLength>3_000_000)
    throw new Error('O modelo Word deve ter entre 1 KB e 3 MB.');
  let files:Record<string,Uint8Array>;
  try{files=unzipSync(template);}catch{throw new Error('O arquivo não é um DOCX válido.');}
  const doc=files['word/document.xml'];
  if(!doc||doc.byteLength>2_000_000)throw new Error('O conteúdo Word é inválido.');
  const text=decodeXml(strFromU8(doc).replace(/<[^>]+>/g,''));
  if(['AÇÃO DE EXECUÇÃO DE TÍTULO EXTRAJUDICIAL','I – DOS FATOS','DO DIREITO',
      'III – DO PEDIDO','DANIEL COSTA LADEIRA'].some(s=>!text.includes(s)))
    throw new Error('Use o modelo original de execução judicial da Ladeira Advogados.');
  return files;
}
export function validateExecutionTemplate(template:Uint8Array):void {unzipTemplate(template);}

export function mergeExecutionTemplate(template:Uint8Array,lines:GeneratedParagraph[]):Uint8Array {
  const files=unzipTemplate(template);
  const seen=new Set<string>();
  const xml=strFromU8(files['word/document.xml']).replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,p=>{
    const old=paragraphText(p);
    if(old.includes('JUIZADO ESPECIAL CÍVEL DA COMARCA DE')){
      seen.add('comarca');
      return replaceText(p,old,generated(lines,'EXCELENTÍSSIMO(A)'));
    }
    if(old.includes('em face do ')&&old.includes('pelos fatos e fundamentos')){
      const next=generated(lines,'em face do ');
      const oldName=old.match(/em face do\s+([^,]+),\s*/)?.[1];
      const newName=next.match(/em face do\s+([^,]+),\s*/)?.[1];
      if(!oldName||!newName)throw new Error('Qualificação do cliente não identificada.');
      const oldTail=old.slice(old.indexOf(oldName)+oldName.length+2);
      const newTail=next.slice(next.indexOf(newName)+newName.length+2);
      seen.add('qualificacao');
      return replaceText(replaceText(p,oldName,newName),oldTail,newTail);
    }
    for(const [prefix,key] of [
      ['A parte autora celebrou contrato','dataContrato'],
      ['No referido instrumento contratual','valorContrato'],
      ['Entretanto, a parte ré deixou de cumprir','inadimplencia'],
      ['Assim, considerando-se a tentativa infrutífera','direitoValor'],
    ] as const){
      if(old.startsWith(prefix)){seen.add(key);return replaceText(p,old,generated(lines,prefix));}
    }
    if(old.includes('c) julgue totalmente procedente')){
      const next=generated(lines,'c) julgue totalmente procedente');
      const oldNums=moneyNums(old),newNums=moneyNums(next);
      const oldWords=moneyWords(old),newWords=moneyWords(next);
      if(oldNums.length!==3||newNums.length!==3||oldWords.length!==2||newWords.length!==2)
        throw new Error('O item c do pedido é incompatível com o modelo original.');
      let result=p;
      for(let i=0;i<3;i++)result=replaceText(result,oldNums[i],newNums[i]);
      for(let i=0;i<2;i++)result=replaceText(result,oldWords[i],newWords[i]);
      if(paragraphText(result).includes('previsto previsto'))
        result=replaceText(result,'previsto previsto','previsto');
      seen.add('pedidoC');
      return result;
    }
    if(old.startsWith('Dá-se a causa o valor de')){
      const next=generated(lines,'Dá-se a causa o valor de');
      const valueBefore=moneyNums(old)[0]?.replace(/^R\$\s*/,'');
      const valueAfter=moneyNums(next)[0]?.replace(/^R\$\s*/,'');
      if(!valueBefore||!valueAfter)throw new Error('Valor da causa ausente.');
      seen.add('valorCausa');
      return replaceText(p,valueBefore,valueAfter);
    }
    if(old.trim().startsWith('Vila Velha/ES,')&&/\d{4}/.test(old)){
      seen.add('assinatura');
      return replaceText(p,old,generated(lines,'Vila Velha/ES,'));
    }
    return p;
  });
  const needed=['comarca','qualificacao','dataContrato','valorContrato','inadimplencia','direitoValor','pedidoC','valorCausa','assinatura'];
  const missing=needed.filter(x=>!seen.has(x));
  if(missing.length)throw new Error('O modelo não contém todos os campos esperados: '+missing.join(', '));
  files['word/document.xml']=strToU8(xml);
  return zipSync(files,{level:6});
}
