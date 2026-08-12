import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { sendWhatsAppMedia } from '@/lib/whatsappApi';

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

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) throw new Error('Arquivo muito grande. Envie arquivos de até 15 MB nesta versão.');

    const admin = createAdminSupabase();
    const originalName = safeName(file.name || 'arquivo');
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${profile.law_firm_id}/whatsapp/${Date.now()}-${originalName}`;

    const upload = await admin.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
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
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name || originalName,
        fileSize: file.size,
        caption,
        clientId,
        sentBy: session.user.id,
        storagePath,
      });

      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      await admin.storage.from('documents').remove([storagePath]).catch(() => null);
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar arquivo pelo WhatsApp.' }, { status: 400 });
  }
}
