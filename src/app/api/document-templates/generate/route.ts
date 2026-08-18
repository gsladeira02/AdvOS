import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

const A4 = { width: 595.28, height: 841.89 };
const COLORS = { ink: rgb(0.10, 0.11, 0.13), muted: rgb(0.34, 0.37, 0.42), teal: rgb(0.05, 0.36, 0.31), gold: rgb(0.78, 0.58, 0.22), line: rgb(0.88, 0.89, 0.91), pale: rgb(0.96, 0.97, 0.97) };

function safe(v: unknown) { return String(v ?? '').trim(); }
function moneyBR(n: number) { return n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function extensoBR(n: number) {
  const units = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez'];
  if (n >= 0 && n <= 10 && Number.isInteger(n)) return units[n];
  return moneyBR(n);
}
function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let line='';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line); return lines;
}
function drawHeader(page: PDFPage, logo: any, bold: PDFFont) {
  const { width, height } = page.getSize();
  page.drawLine({start:{x:45,y:height-88}, end:{x:width-45,y:height-88}, thickness:0.8, color:COLORS.line});
  if (logo) page.drawImage(logo,{x:width-112,y:height-76,width:68,height:54});
  page.drawText('LADEIRA ADVOGADOS',{x:45,y:height-58,size:10,font:bold,color:COLORS.ink});
}
function drawFooter(page: PDFPage, font: PDFFont, pageNo: number) {
  const { width } = page.getSize();
  page.drawLine({start:{x:45,y:30},end:{x:width-45,y:30},thickness:0.6,color:COLORS.line});
  page.drawText('Ladeira Advogados · Documento gerado pelo AdvOS',{x:45,y:17,size:7.5,font,color:COLORS.muted});
  page.drawText(String(pageNo),{x:width-55,y:17,size:7.5,font,color:COLORS.muted});
}

export async function POST(req: Request) {
  const { profile, session } = await getCurrentProfile();
  const f = await req.formData();
  const templateId = safe(f.get('template_id'));
  const clientId = safe(f.get('client_id'));
  const title = safe(f.get('title')) || 'Documento gerado';
  const object = safe(f.get('objeto'));
  const foro = safe(f.get('foro'));
  const successPercent = safe(f.get('percentual_exito'));
  const rescissionFine = safe(f.get('multa_rescisao'));
  const hypo = String(f.get('hipossuficiencia') || '') === '1';

  const db = createAdminSupabase();
  const [{ data: t }, { data: c }, { data: lf }] = await Promise.all([
    db.from('document_templates').select('*').eq('id', templateId).eq('law_firm_id', profile.law_firm_id).maybeSingle(),
    db.from('clients').select('*').eq('id', clientId).eq('law_firm_id', profile.law_firm_id).maybeSingle(),
    db.from('law_firms').select('*').eq('id', profile.law_firm_id).maybeSingle(),
  ]);
  if (!t || !c || !lf) return NextResponse.json({ok:false,error:'Modelo, cliente ou escritório não encontrado.'},{status:404});

  let paymentDetails = '';
  if (String(t.category || '').toLowerCase().includes('contrato')) {
    const { data: fc } = await db.from('financial_contracts').select('id,total_amount,description').eq('law_firm_id',profile.law_firm_id).eq('client_id',clientId).eq('status','ativo').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (fc) {
      const { data: installments } = await db.from('financial_installments').select('amount,due_date,payment_method,billing_type,status').eq('law_firm_id',profile.law_firm_id).eq('contract_id',fc.id).order('due_date',{ascending:true});
      const parts = (installments||[]).map((x:any,i:number)=>`${i===0?'entrada':'parcela'} de R$ ${moneyBR(Number(x.amount||0))}${x.due_date?` com vencimento em ${new Date(`${x.due_date}T12:00:00`).toLocaleDateString('pt-BR')}`:''}`).join(', ');
      paymentDetails = parts ? `O pagamento será realizado da seguinte forma: ${parts}.` : `O pagamento será realizado conforme pactuado entre as partes.`;
    }
  }

  const clientName = safe(c.name);
  const clientCpf = safe(c.cpf || c.doc);
  const clientRg = safe((c as any).rg);
  const clientPhone = safe(c.whatsapp || c.phone);
  const clientEmail = safe(c.email);
  const clientAddress = safe(c.address);
  const local = safe((c as any).city || (c as any).municipio || 'Vila Velha/ES');
  const now = new Date();
  const dataExtenso = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const office = 'DANIEL LADEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA';
  const officeAddress = safe(lf.address) || 'Rodovia do Sol, 2070, Ed. Royal Blue Corporate, sala 1008, Praia de Itaparica, Vila Velha/ES';
  const officeCnpj = safe(lf.cnpj) || '57.377.637/0001-19';
  const officePhone = safe(lf.phone) || '(27) 99794-0089';
  const officeEmail = safe(lf.email) || 'dladadeiradv@gmail.com';
  const danielLine = `DANIEL COSTA LADEIRA, brasileiro, casado, advogado, OAB/ES 23.416, representando ${office}`;
  const clientQualification = `${clientName}, ${safe((c as any).nationality || 'brasileiro(a)')}, ${safe((c as any).marital_status || 'estado civil não informado')}, ${safe((c as any).profession || 'profissão não informada')}, RG ${clientRg || 'não informado'}, CPF ${clientCpf || 'não informado'}, residente e domiciliado(a) em ${clientAddress || 'endereço não informado'}.`;
  const officeQualification = `${office}, sociedade individual de advocacia, inscrita no CNPJ sob o nº ${officeCnpj}, com endereço profissional em ${officeAddress}, contato ${officePhone}, e-mail ${officeEmail}, representada por Daniel Costa Ladeira, advogado, inscrito na OAB/ES sob o nº 23.416.`;

  let content = safe(t.content);
  const values: Record<string,string> = {
    cliente: clientName, cliente_nome: clientName, cliente_cpf: clientCpf, cliente_qualificacao: clientQualification,
    cpf: clientCpf, email: clientEmail, telefone: clientPhone, endereco: clientAddress,
    escritorio_qualificacao: officeQualification, outorgados: officeQualification,
    objeto: object || safe((c as any).case_object) || 'prestação de serviços advocatícios descritos neste instrumento',
    valor_total: safe(f.get('valor_total')) || '', valor_total_extenso: safe(f.get('valor_total_extenso')) || '',
    pagamento_detalhado: paymentDetails, clausula_exito: successPercent ? `Parágrafo segundo. Eventual benefício econômico será remunerado em ${successPercent}% (por cento).` : '',
    multa_rescisao: rescissionFine || '', foro: foro || local || 'Vila Velha/ES',
    contratado_assinatura: office,
    contratado_nome: office,
    contratado_representante: 'DANIEL COSTA LADEIRA', data: now.toLocaleDateString('pt-BR'), data_extenso: dataExtenso,
    local: local, local_em_maiusculas: local.toUpperCase(), declaracao_hipossuficiencia: hypo ? `DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA\nDeclaro, sob as penas da lei, que não disponho de rendimentos suficientes para suportar as despesas processuais, requerendo os benefícios da gratuidade de justiça.` : '',
  };
  for (const [k,v] of Object.entries(values)) content = content.replaceAll(`{{${k}}}`,v);
  content = content.replace(/\{\{[^}]+\}\}/g,'');
  if (!values.pagamento_detalhado) content = content.replace(/\s*O pagamento será realizado conforme pactuado entre as partes\.\s*/,' ');

  const official = /Ladeira Advogados - (Contrato|Procuração)/i.test(String(t.name||''));
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  let logo:any=null;
  try { const bytes = fs.readFileSync(path.join(process.cwd(),'public','brand','ladeira-advogados.png')); logo=await pdf.embedPng(bytes); } catch {}
  const pageMarginX = 62, textWidth = A4.width - pageMarginX*2;
  let pageNo=1; let page=pdf.addPage([A4.width,A4.height]); drawHeader(page,logo,bold); let y=A4.height-116;
  const titleText = String(t.name||title).replace('Ladeira Advogados - ','').toUpperCase();
  const titleLines = wrap(titleText, bold, 15, textWidth);
  for (const l of titleLines){ page.drawText(l,{x:pageMarginX,y,size:15,font:bold,color:COLORS.ink}); y-=20; }
  page.drawLine({start:{x:pageMarginX,y:y-5},end:{x:A4.width-pageMarginX,y:y-5},thickness:1,color:COLORS.gold}); y-=28;

  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line=raw.trim();
    if(!line){y-=8; continue;}
    const isHeading = /^(DO |DAS |PODERES$|DECLARAÇÃO DE|LADEIRA ADVOGADOS$|PROCURAÇÃO$)/i.test(line) || (/^[A-ZÀ-Ú][A-ZÀ-Ú0-9 \-]{5,}$/.test(line) && line.length<80);
    if (isHeading) y-=5;
    const baseSize = isHeading ? 11.2 : 10.3;
    const baseFont = isHeading ? bold : regular;
    const maxW = textWidth;
    for (const wl of wrap(line,baseFont,baseSize,maxW)) {
      if (y<82){ drawFooter(page, regular, pageNo); pageNo++; page=pdf.addPage([A4.width,A4.height]); drawHeader(page,logo,bold); y=A4.height-116; }
      page.drawText(wl,{x:pageMarginX,y,size:baseSize,font:baseFont,color:COLORS.ink}); y-=14.6;
    }
    y -= isHeading ? 4 : 1.5;
  }
  drawFooter(page, regular, pageNo);
  // Assinaturas e evidências são anexadas somente quando o documento é efetivamente assinado.
  const bytes=Buffer.from(await pdf.save());
  const slug=title.replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'documento';
  const storagePath=`${profile.law_firm_id}/${clientId}/modelo-${Date.now()}-${slug}.pdf`;
  const up=await db.storage.from('documents').upload(storagePath,bytes,{contentType:'application/pdf',upsert:false});
  if(up.error) return NextResponse.json({ok:false,error:up.error.message},{status:400});
  const {data:doc,error}=await db.from('documents').insert({law_firm_id:profile.law_firm_id,client_id:clientId,title,doc_type:t.category||'modelo',storage_path:storagePath,notes:`Gerado pelo modelo ${t.name}`}).select('id').single();
  if(error)return NextResponse.json({ok:false,error:error.message},{status:400});
  await db.from('activity_logs').insert({law_firm_id:profile.law_firm_id,auth_user_id:session.user.id,action:'gerou_documento_modelo',entity:'documents',entity_id:doc.id,metadata:{template_id:templateId,client_id:clientId,official}});
  return NextResponse.redirect(new URL('/app/modelos-documentos?gerado=1',req.url),303);
}
