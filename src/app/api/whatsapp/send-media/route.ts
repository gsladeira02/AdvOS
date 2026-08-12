import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { sendWhatsAppMedia, sendWhatsAppMediaBuffer } from '@/lib/whatsappApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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

function baseMime(value?: string | null) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function acceptedWhatsAppAudioMime(mimeType?: string | null, fileName = '') {
  const mime = baseMime(mimeType);
  const name = String(fileName || '').toLowerCase();

  if (mime === 'audio/ogg') return true;
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return true;
  if (mime === 'audio/amr') return true;
  if (mime === 'audio/mp4' || mime === 'audio/aac') return true;

  return /\.(ogg|opus|mp3|mpeg|amr|m4a|mp4|aac)$/i.test(name);
}

function looksLikeAudioFile(file: File, forceRecorded = false) {
  const mime = baseMime(file.type);
  const name = String(file.name || '').toLowerCase();
  if (forceRecorded || name.startsWith('audio-whatsapp-')) return true;
  if (mime.startsWith('audio/')) return true;
  return /\.(webm|ogg|opus|m4a|mp3|aac|amr|wav)$/i.test(name);
}

async function normalizeFileForWhatsApp(file: File, forceRecordedAudio = false) {
  const buffer = Buffer.from(await file.arrayBuffer());
  let fileName = safeName(file.name || 'arquivo');
  let mimeType = file.type || 'application/octet-stream';
  let converted = false;

  const looksAudio = looksLikeAudioFile(file, forceRecordedAudio);

  if (looksAudio) {
    const cleanMime = baseMime(mimeType);
    const isWebm = cleanMime === 'audio/webm' || cleanMime === 'video/webm' || fileName.toLowerCase().endsWith('.webm');
    const isWav = cleanMime === 'audio/wav' || cleanMime === 'audio/x-wav' || fileName.toLowerCase().endsWith('.wav');
    const isOctet = cleanMime === 'application/octet-stream';

    if (!acceptedWhatsAppAudioMime(mimeType, fileName) || isWebm || isWav || isOctet) {
      throw new Error('Formato de áudio não aceito pela Meta. Grave novamente pelo microfone do AdvOS atualizado, que prepara o áudio em MP3 no navegador, ou envie um arquivo MP3, M4A, OGG/OPUS, AAC ou AMR.');
    }

    if (cleanMime === 'audio/mp3') mimeType = 'audio/mpeg';
    if (!/\.(ogg|opus|mp3|mpeg|amr|m4a|mp4|aac)$/i.test(fileName)) {
      const extension = baseMime(mimeType).includes('mpeg') ? 'mp3'
        : baseMime(mimeType).includes('ogg') ? 'ogg'
        : baseMime(mimeType).includes('amr') ? 'amr'
        : baseMime(mimeType).includes('aac') ? 'aac'
        : 'm4a';
      fileName = `${fileName.replace(/\.[^.]+$/, '') || 'audio-whatsapp'}.${extension}`;
    }
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
    const recordedAudio = ['1', 'true', 'yes', 'sim'].includes(str(form.get('recorded_audio') || form.get('recordedAudio')).toLowerCase());

    if (!phone) throw new Error('Telefone/WhatsApp do cliente não informado.');
    if (!(file instanceof File)) throw new Error('Selecione um arquivo para enviar.');
    if (!file.size) throw new Error('Arquivo vazio.');

    const normalized = await normalizeFileForWhatsApp(file, recordedAudio);
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
      const isAudioMessage = String(normalized.mimeType || '').toLowerCase().startsWith('audio/');
      const result = isAudioMessage
        ? await sendWhatsAppMediaBuffer({
            lawFirmId: profile.law_firm_id,
            to: phone,
            buffer: normalized.buffer,
            mimeType: normalized.mimeType || 'application/octet-stream',
            fileName: normalized.fileName || originalName,
            fileSize: normalized.size,
            caption,
            clientId,
            sentBy: session.user.id,
            storagePath,
            mediaUrl: signed.data.signedUrl,
          })
        : await sendWhatsAppMedia({
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

      return NextResponse.json({ ok: true, converted: normalized.converted, uploaded_by_id: isAudioMessage, ...result }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    } catch (error) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar arquivo pelo WhatsApp.' }, { status: 400 });
  }
}
