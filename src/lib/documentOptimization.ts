import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { unzipSync, zipSync } from 'fflate';

export type DocumentOptimizationResult = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  originalBytes: number;
  storedBytes: number;
  optimized: boolean;
  convertedToPdf: boolean;
  savingsBytes: number;
  savingsPercent: number;
  strategy: string;
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const OFFICE_ZIP_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx']);
const PDF_CONVERTIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'txt', 'csv', 'xls', 'xlsx']);

function ext(name?: string | null) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || '';
}

function baseName(name?: string | null) {
  const value = String(name || 'documento').trim() || 'documento';
  return value.replace(/\.[^.]+$/, '') || 'documento';
}

function baseMime(value?: string | null) {
  return String(value || '').toLowerCase().split(';')[0].trim();
}

function percentSaved(original: number, stored: number) {
  if (!original || stored >= original) return 0;
  return Math.max(0, Math.round(((original - stored) / original) * 100));
}

function result(input: {
  original: Buffer;
  output: Buffer;
  fileName: string;
  mimeType: string;
  optimized: boolean;
  convertedToPdf?: boolean;
  strategy: string;
}): DocumentOptimizationResult {
  const originalBytes = input.original.length;
  const storedBytes = input.output.length;
  return {
    buffer: input.output,
    fileName: input.fileName,
    mimeType: input.mimeType,
    originalBytes,
    storedBytes,
    optimized: input.optimized,
    convertedToPdf: Boolean(input.convertedToPdf),
    savingsBytes: Math.max(0, originalBytes - storedBytes),
    savingsPercent: percentSaved(originalBytes, storedBytes),
    strategy: input.strategy,
  };
}

export function canConvertDocumentToPdf(fileName?: string | null, mimeType?: string | null) {
  const extension = ext(fileName);
  const mime = baseMime(mimeType);
  if (mime === 'application/pdf' || extension === 'pdf') return false;
  if (PDF_CONVERTIBLE_EXTENSIONS.has(extension)) return true;
  return mime.startsWith('image/') || mime === 'text/plain' || mime === 'text/csv';
}

async function optimizeImage(buffer: Buffer, extension: string, mimeType: string) {
  try {
    const sharp = (await import('sharp')).default;
    const image = sharp(buffer, { failOn: 'none' }).rotate();
    const metadata = await image.metadata();
    const shouldResize = Number(metadata.width || 0) > 2600 || Number(metadata.height || 0) > 2600;
    let pipeline = image;
    if (shouldResize) {
      pipeline = pipeline.resize({ width: 2600, height: 2600, fit: 'inside', withoutEnlargement: true });
    }

    let optimized: Buffer;
    if (extension === 'png' || mimeType === 'image/png') {
      optimized = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    } else if (extension === 'webp' || mimeType === 'image/webp') {
      optimized = await pipeline.webp({ quality: 82, effort: 5 }).toBuffer();
    } else {
      optimized = await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
    }

    return optimized.length < buffer.length ? optimized : buffer;
  } catch (error) {
    console.warn('Não foi possível otimizar imagem; original será preservado.', error);
    return buffer;
  }
}

async function optimizePdf(buffer: Buffer) {
  try {
    const pdf = await PDFDocument.load(buffer, {
      updateMetadata: false,
      throwOnInvalidObject: false,
      ignoreEncryption: false,
    });
    const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 50 });
    const optimized = Buffer.from(bytes);
    return optimized.length < buffer.length ? optimized : buffer;
  } catch (error) {
    console.warn('Não foi possível reotimizar PDF; original será preservado.', error);
    return buffer;
  }
}

function optimizeZipContainer(buffer: Buffer) {
  try {
    // DOCX/XLSX/PPTX são contêineres ZIP. Recompactamos no nível máximo e
    // só usamos o resultado quando ele realmente fica menor.
    const entries = unzipSync(new Uint8Array(buffer));
    const recompressed = Buffer.from(zipSync(entries, { level: 9 }));
    return recompressed.length < buffer.length ? recompressed : buffer;
  } catch (error) {
    console.warn('Não foi possível recompactar contêiner Office; original será preservado.', error);
    return buffer;
  }
}

function sanitizePdfText(value: string) {
  return String(value || '')
    .replace(/\t/g, '    ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

function wrapLine(text: string, maxChars = 92) {
  const clean = sanitizePdfText(text);
  if (!clean) return [''];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) { lines.push(current); current = ''; }
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function textLinesToPdf(lines: string[], title?: string | null) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 44;
  const fontSize = 9.5;
  const lineHeight = 13;
  const safeTitle = sanitizePdfText(String(title || '').trim());

  let page = pdf.addPage([width, height]);
  let y = height - margin;
  if (safeTitle) {
    page.drawText(safeTitle.slice(0, 100), { x: margin, y, size: 13, font: bold, color: rgb(0.07, 0.13, 0.23) });
    y -= 24;
  }

  const addPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };

  for (const rawLine of lines) {
    const wrapped = wrapLine(rawLine, 95);
    for (const line of wrapped) {
      if (y < margin + lineHeight) addPage();
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.12, 0.12, 0.12) });
      y -= lineHeight;
    }
  }

  return Buffer.from(await pdf.save({ useObjectStreams: true, addDefaultPage: false }));
}

async function imageToPdf(buffer: Buffer, title?: string | null) {
  const sharp = (await import('sharp')).default;
  // Fundo branco evita PDFs enormes causados por transparência em PNG e mantém
  // documentos fotografados legíveis.
  const jpg = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: 2200, height: 3000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, progressive: true, mozjpeg: true })
    .toBuffer();

  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(jpg);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 24;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
  if (title) pdf.setTitle(sanitizePdfText(title).slice(0, 120));
  return Buffer.from(await pdf.save({ useObjectStreams: true, addDefaultPage: false }));
}

async function spreadsheetToPdf(buffer: Buffer, title?: string | null) {
  const XLSXModule = await import('xlsx');
  const XLSX: any = (XLSXModule as any).default || XLSXModule;
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const lines: string[] = [];
  let totalCells = 0;
  const maxCells = 250000;

  for (const sheetName of workbook.SheetNames) {
    lines.push(`PLANILHA: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[];
    for (const row of rows) {
      const cells = (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim());
      totalCells += cells.length;
      if (totalCells > maxCells) {
        throw new Error('A planilha é muito extensa para uma conversão segura para PDF. Salve-a no formato original ou divida a planilha antes de converter.');
      }
      lines.push(cells.join(' | '));
    }
    lines.push('');
  }

  return textLinesToPdf(lines, title);
}

async function convertToPdf(buffer: Buffer, fileName: string, mimeType: string) {
  const extension = ext(fileName);
  const mime = baseMime(mimeType);
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith('image/')) {
    return imageToPdf(buffer, fileName);
  }
  if (extension === 'txt' || extension === 'csv' || mime === 'text/plain' || mime === 'text/csv') {
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('O arquivo de texto é muito grande para uma conversão segura para PDF. Salve no formato original ou divida o arquivo.');
    }
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return textLinesToPdf(text.split(/\r?\n/), fileName);
  }
  if (extension === 'xls' || extension === 'xlsx') {
    return spreadsheetToPdf(buffer, fileName);
  }
  throw new Error('Este formato não pode ser convertido para PDF com segurança nesta versão.');
}

export async function optimizeStoredDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
  convertToPdf?: boolean;
}): Promise<DocumentOptimizationResult> {
  const original = Buffer.from(input.buffer);
  const fileName = String(input.fileName || 'documento').trim() || 'documento';
  const mimeType = baseMime(input.mimeType) || 'application/octet-stream';
  const extension = ext(fileName);

  if (input.convertToPdf) {
    if (!canConvertDocumentToPdf(fileName, mimeType)) {
      throw new Error('Este arquivo não é compatível com a conversão para PDF.');
    }
    const converted = await convertToPdf(original, fileName, mimeType);
    const optimizedPdf = await optimizePdf(converted);
    return result({
      original,
      output: optimizedPdf,
      fileName: `${baseName(fileName)}.pdf`,
      mimeType: 'application/pdf',
      optimized: optimizedPdf.length < original.length,
      convertedToPdf: true,
      strategy: 'convertido_para_pdf_otimizado',
    });
  }

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const optimized = await optimizePdf(original);
    return result({ original, output: optimized, fileName, mimeType: 'application/pdf', optimized: optimized.length < original.length, strategy: 'pdf_otimizado' });
  }

  if (IMAGE_EXTENSIONS.has(extension) || ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    const optimized = await optimizeImage(original, extension, mimeType);
    return result({ original, output: optimized, fileName, mimeType, optimized: optimized.length < original.length, strategy: 'imagem_otimizada' });
  }

  if (OFFICE_ZIP_EXTENSIONS.has(extension)) {
    const optimized = optimizeZipContainer(original);
    return result({ original, output: optimized, fileName, mimeType, optimized: optimized.length < original.length, strategy: 'office_recompactado' });
  }

  if (extension === 'zip' || mimeType === 'application/zip') {
    const optimized = optimizeZipContainer(original);
    return result({ original, output: optimized, fileName, mimeType, optimized: optimized.length < original.length, strategy: 'zip_recompactado' });
  }

  return result({ original, output: original, fileName, mimeType, optimized: false, strategy: 'formato_preservado' });
}
