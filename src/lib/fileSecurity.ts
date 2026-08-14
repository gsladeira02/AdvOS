import 'server-only';
import { SecurityError } from '@/lib/security';

const SAFE_EXTENSIONS = new Set([
  'pdf','jpg','jpeg','png','gif','webp','txt','csv',
  'doc','docx','xls','xlsx','ppt','pptx',
  'zip','mp3','m4a','mp4','aac','ogg','opus','wav','amr'
]);
const DANGEROUS_EXTENSIONS = new Set([
  'html','htm','svg','js','mjs','cjs','exe','dll','msi','bat','cmd','com','scr','ps1','sh','jar','apk','app','dmg','iso',
  'docm','xlsm','pptm','xlam','xll','vbs','vbe','wsf','wsh','reg','lnk','hta','php','phtml','py','rb','pl','cgi'
]);

function extension(name: string) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || '';
}

function starts(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((value, index) => buffer[index] === value);
}

function ascii(buffer: Buffer, start: number, end: number) {
  return buffer.subarray(start, Math.min(end, buffer.length)).toString('ascii');
}

function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) return false;
  const text = sample.toString('utf8').toLowerCase();
  if (/<\s*(?:html|script|svg|iframe|object|embed|meta|link)\b/i.test(text)) return false;
  if (/^\s*#!\s*\//.test(text)) return false;
  return true;
}

export function assertSafeUploadedFile(name: string, mime: string, buffer: Buffer) {
  const ext = extension(name);
  const cleanMime = String(mime || '').toLowerCase().split(';')[0].trim();

  if (!ext || DANGEROUS_EXTENSIONS.has(ext) || !SAFE_EXTENSIONS.has(ext)) {
    throw new SecurityError('Este tipo de arquivo não é permitido.', 415);
  }

  // Assinaturas executáveis conhecidas são recusadas independentemente do nome/MIME.
  if (starts(buffer, [0x4d, 0x5a]) || starts(buffer, [0x7f, 0x45, 0x4c, 0x46])) {
    throw new SecurityError('Arquivo executável não é permitido.', 415);
  }

  let valid = false;
  if (ext === 'pdf') valid = ascii(buffer, 0, 5) === '%PDF-';
  else if (['jpg','jpeg'].includes(ext)) valid = starts(buffer, [0xff,0xd8,0xff]);
  else if (ext === 'png') valid = starts(buffer, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  else if (ext === 'gif') valid = ascii(buffer, 0, 4) === 'GIF8';
  else if (ext === 'webp') valid = ascii(buffer,0,4)==='RIFF' && ascii(buffer,8,12)==='WEBP';
  else if (['docx','xlsx','pptx','zip'].includes(ext)) valid = starts(buffer,[0x50,0x4b,0x03,0x04]) || starts(buffer,[0x50,0x4b,0x05,0x06]) || starts(buffer,[0x50,0x4b,0x07,0x08]);
  else if (['doc','xls','ppt'].includes(ext)) valid = starts(buffer,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  else if (['txt','csv'].includes(ext)) valid = looksLikeText(buffer);
  else if (['mp3'].includes(ext)) valid = ascii(buffer,0,3)==='ID3' || (buffer.length > 1 && buffer[0]===0xff && (buffer[1] & 0xe0)===0xe0);
  else if (['m4a','mp4'].includes(ext)) valid = buffer.length >= 12 && ascii(buffer,4,8)==='ftyp';
  else if (['ogg','opus'].includes(ext)) valid = ascii(buffer,0,4)==='OggS';
  else if (ext === 'wav') valid = ascii(buffer,0,4)==='RIFF' && ascii(buffer,8,12)==='WAVE';
  else if (ext === 'amr') valid = ascii(buffer,0,5)==='#!AMR';
  else if (ext === 'aac') valid = buffer.length > 1 && buffer[0]===0xff && (buffer[1] & 0xf0)===0xf0;

  if (!valid) {
    throw new SecurityError('O conteúdo do arquivo não corresponde ao tipo informado.', 415);
  }

  // Alguns navegadores enviam octet-stream para documentos válidos; por isso MIME
  // não é usado como fonte de verdade, apenas o conteúdo + extensão.
  if (cleanMime.includes('text/html') || cleanMime.includes('svg') || cleanMime.includes('javascript')) {
    throw new SecurityError('Este tipo de arquivo não é permitido.', 415);
  }
}
