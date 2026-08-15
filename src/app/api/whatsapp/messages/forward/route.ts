import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOrCreateConversation } from '@/lib/whatsappApi';
import { sendWhatsAppMediaBuffer, sendWhatsAppText } from '@/lib/whatsappApi';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { readJsonBody, enforceRateLimit, publicErrorMessage, SecurityError } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function str(value: any) { return String(value || '').trim(); }

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    await enforceRateLimit(admin, `user:${session.user.id}:whatsapp-forward`, 60, 60);
    const body = await readJsonBody(req, 65536);
    const messageIds = Array.isArray(body.messageIds) ? body.messageIds.map(str).filter(Boolean) : [];
    const messageId = str(body.messageId);
    const ids = messageIds.length ? Array.from(new Set(messageIds)) : (messageId ? [messageId] : []);
    const targetPhone = normalizeBrazilPhone(str(body.targetPhone || body.phone));
    const targetClientId = str(body.targetClientId || body.clientId) || null;
    if (!ids.length) throw new Error('Nenhuma mensagem informada.');
    if (!targetPhone) throw new Error('Contato de destino sem WhatsApp válido.');

    const { data: messages, error: messageError } = await admin
      .from('whatsapp_messages')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .in('id', ids)
      .is('deleted_at', null);
    if (messageError) throw new Error(messageError.message);
    if (!messages?.length || messages.length !== ids.length) throw new Error('Uma ou mais mensagens não foram encontradas.');
    if (messages.some((message: any) => String(message.direction || '') !== 'inbound')) throw new Error('Somente mensagens recebidas podem ser encaminhadas.');

    const targetConversation = await getOrCreateConversation({ lawFirmId: profile.law_firm_id, clientId: targetClientId, phone: targetPhone });
    const orderedMessages = [...messages].sort((a: any, b: any) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime());
    let result: any = null;

    for (const message of orderedMessages) {
      const type = String(message.message_type || 'text').toLowerCase();
      const mediaType = ['image', 'video', 'audio', 'document', 'sticker'].includes(type);
      if (mediaType) {
        const storagePath = str(message.storage_path || message.raw_payload?.advos_storage_path);
        if (!storagePath) throw new Error(`O arquivo da mensagem ${message.id} não está disponível para encaminhamento.`);
        const download = await admin.storage.from('documents').download(storagePath);
        if (download.error || !download.data) throw new Error(download.error?.message || 'Não foi possível recuperar um dos arquivos para encaminhamento.');
        const buffer = Buffer.from(await download.data.arrayBuffer());
        result = await sendWhatsAppMediaBuffer({
          lawFirmId: profile.law_firm_id,
          to: targetPhone,
          buffer,
          mimeType: String(message.mime_type || 'application/octet-stream'),
          fileName: String(message.file_name || 'arquivo'),
          fileSize: Number(message.file_size || buffer.length),
          caption: type === 'text' ? str(message.body) : null,
          clientId: targetClientId || targetConversation.client_id || null,
          sentBy: session.user.id,
          storagePath,
        });
      } else {
        const text = str(message.body);
        if (!text) throw new Error('Uma das mensagens não possui conteúdo encaminhável.');
        result = await sendWhatsAppText({
          lawFirmId: profile.law_firm_id,
          to: targetPhone,
          message: text,
          clientId: targetClientId || targetConversation.client_id || null,
          sentBy: session.user.id,
        });
      }
    }

    return NextResponse.json({ ok: true, sentCount: orderedMessages.length, conversationId: result?.conversationId || targetConversation.id, externalId: result?.externalId || null });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível encaminhar a mensagem.') }, { status });
  }
}
