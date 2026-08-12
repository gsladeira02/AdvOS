import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, writeFile } from 'fs/promises';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { sendWhatsAppMedia } from '@/lib/whatsappApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

function str(value: any) {
  return String(value || '').trim();
}

function safeName(name: string) {
  return String(name || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'arquivo';
}

function isBrowserRecordedAudio(file: File) {
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime.includes('audio/webm') || mime.includes('video/webm') || name.endsWith('.webm');
}

function supportedWhatsAppAudioMime(file: File) {
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (mime.includes('audio/ogg') || name.endsWith('.ogg') || name.endsWith('.opus')) return 'audio/ogg; codecs=opus';
  if (mime.includes('audio/mpeg') || name.endsWith('.mp3')) return 'audio/mpeg';
  if (mime.includes('audio/mp4') || name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (mime.includes('audio/aac') || name.endsWith('.aac')) return 'audio/aac';
  if (mime.includes('audio/amr') || name.endsWith('.amr')) return 'audio/amr';
  return '';
}

async function convertWebmToOggOpus(buffer: Buffer) {
  let ffmpegPath = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpeg = require('@ffmpeg-installer/ffmpeg');
    ffmpegPath = ffmpeg?.path || '';
  } catch {
    ffmpegPath = '';
  }

  if (!ffmpegPath) {
    throw new Error('Não foi possível converter o áudio: ffmpeg não encontrado no build. Faça redeploy depois de atualizar o package.json.');
  }

  const id = randomUUID();
  const inputPath = join(tmpdir(), `advos-audio-${id}.webm`);
  const outputPath = join(tmpdir(), `advos-audio-${id}.ogg`);

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-application', 'voip',
      outputPath,
    ], { timeout: 30000 });
    const output = await readFile(outputPath);
    if (!output.length) throw new Error('Conversão de áudio gerou arquivo vazio.');
    return output;
  } finally {
    await unlink(inputPath).catch(() => null);
    await unlink(outputPath).catch(() => null);
  }
}

async function normalizeFileForWhatsApp(file: File) {
  let buffer = Buffer.from(await file.arrayBuffer());
  let fileName = file.name || 'arquivo';
  let mimeType = file.type || 'application/octet-stream';
  let converted = false;

  const supportedAudio = supportedWhatsAppAudioMime(file);
  if (supportedAudio) {
    mimeType = supportedAudio;
  } else if (isBrowserRecordedAudio(file)) {
    buffer = await convertWebmToOggOpus(buffer);
    fileName = fileName.replace(/\.[^.]+$/, '') + '.ogg';
    mimeType = 'audio/ogg; codecs=opus';
    converted = true;
  }

  return {
    buffer,
    fileName,
    mimeType,
    converted,
    size: buffer.length,
  };
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const form = await req.formData();
    const file = form.get('file');
    const phone = normalizeBrazilPhone(str(form.get('phone') || form.get('to')));
    const clientId = str(form.get('client_id') || form.get('clientId')) || null;
    const caption = str(form.get('caption'));

    if (!phone) throw new Error('Telefone/WhatsApp do cliente não informado.');
    if (!(file instanceof File)) throw new Error('Selecione um arquivo para enviar.');
    if (!file.size) throw new Error('Arquivo vazio.');

    const normalized = await normalizeFileForWhatsApp(file);
    const isSticker = String(normalized.mimeType || '').toLowerCase() === 'image/webp' || String(normalized.fileName || '').toLowerCase().endsWith('.webp');
    const isAudio = String(normalized.mimeType || '').toLowerCase().startsWith('audio/');
    const maxSize = isSticker ? 500 * 1024 : isAudio ? 16 * 1024 * 1024 : 15 * 1024 * 1024;
    if (normalized.size > maxSize) {
      throw new Error(isSticker ? 'Figurinha muito grande. Envie .webp de até 500 KB.' : isAudio ? 'Áudio muito grande. Envie áudio de até 16 MB.' : 'Arquivo muito grande. Envie arquivos de até 15 MB nesta versão.');
    }

    const admin = createAdminSupabase();
    const originalName = safeName(normalized.fileName || 'arquivo');
    const storagePath = `${profile.law_firm_id}/whatsapp/${Date.now()}-${originalName}`;

    const upload = await admin.storage.from('documents').upload(storagePath, normalized.buffer, {
      contentType: normalized.mimeType || 'application/octet-stream',
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const signed = await admin.storage.from('documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signed.error || !signed.data?.signedUrl) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      throw new Error(signed.error?.message || 'Não foi possível gerar link temporário do arquivo.');
    }

    try {
      const result = await sendWhatsAppMedia({
        lawFirmId: profile.law_firm_id,
        to: phone,
        mediaUrl: signed.data.signedUrl,
        mimeType: normalized.mimeType || 'application/octet-stream',
        fileName: normalized.fileName || originalName,
        fileSize: normalized.size,
        caption,
        clientId,
        sentBy: session.user.id,
        storagePath,
      });

      return NextResponse.json({ ok: true, converted: normalized.converted, ...result });
    } catch (error) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar arquivo pelo WhatsApp.' }, { status: 400 });
  }
}
