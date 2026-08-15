import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit, publicErrorMessage, readJsonBody, SecurityError } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function str(value: any) { return String(value || '').trim(); }
function csvCell(value: any) { const text = value == null ? '' : String(value); return `"${text.replace(/"/g, '""')}"`; }
function messageTypeLabel(message: any) { return str(message?.message_type || 'text').toLowerCase() || 'text'; }

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    await enforceRateLimit(admin, `user:${session.user.id}:whatsapp-export`, 20, 60);

    const body = await readJsonBody(req, 262144);
    const scope = str(body.scope || 'selected');
    const format = str(body.format || 'json') === 'csv' ? 'csv' : 'json';
    const requestedIds: string[] = Array.isArray(body.conversationIds)
      ? Array.from(new Set<string>(body.conversationIds.map(str).filter(Boolean)))
      : [];

    let conversationIds: string[] | null = null;
    if (scope === 'selected') {
      if (!requestedIds.length) throw new SecurityError('Selecione ao menos uma conversa.', 400);
      conversationIds = requestedIds.slice(0, 500);
    } else if (scope !== 'all') {
      throw new SecurityError('Escopo de exportação inválido.', 400);
    }

    // Use select('*') here on purpose. The WhatsApp schema evolved across
    // multiple migrations, so exporting should remain functional even when
    // optional columns from newer migrations are not present yet.
    const conversations: any[] = [];
    const conversationPageSize = 500;

    if (conversationIds) {
      for (let index = 0; index < conversationIds.length; index += conversationPageSize) {
        const batch = conversationIds.slice(index, index + conversationPageSize);
        const { data, error } = await admin
          .from('whatsapp_conversations')
          .select('*')
          .eq('law_firm_id', profile.law_firm_id)
          .in('id', batch)
          .order('updated_at', { ascending: true });
        if (error) throw new Error(`Falha ao carregar conversas para exportação: ${error.message}`);
        conversations.push(...(data || []));
      }
    } else {
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from('whatsapp_conversations')
          .select('*')
          .eq('law_firm_id', profile.law_firm_id)
          .order('updated_at', { ascending: true })
          .range(from, from + conversationPageSize - 1);
        if (error) throw new Error(`Falha ao carregar conversas para exportação: ${error.message}`);
        const page = data || [];
        conversations.push(...page);
        if (page.length < conversationPageSize) break;
        from += conversationPageSize;
        if (conversations.length >= 5000) break;
      }
    }

    if (!conversations.length) throw new SecurityError('Nenhuma conversa encontrada para exportação.', 404);

    const ids = conversations.map((item: any) => String(item.id)).filter(Boolean);
    const messages: any[] = [];
    const messageBatchSize = 80;

    for (let index = 0; index < ids.length; index += messageBatchSize) {
      const batch = ids.slice(index, index + messageBatchSize);
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from('whatsapp_messages')
          .select('*')
          .eq('law_firm_id', profile.law_firm_id)
          .in('conversation_id', batch)
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (error) throw new Error(`Falha ao carregar mensagens para exportação: ${error.message}`);
        const page = data || [];
        messages.push(...page);
        if (page.length < 1000) break;
        from += 1000;
      }
    }

    // Hides are optional across versions. If the feature table does not exist,
    // simply keep the messages in the export rather than failing the export.
    const hiddenIds = new Set<string>();
    const messageIds = messages.map((item: any) => item.id).filter(Boolean);
    if (messageIds.length) {
      const { data: hiddenRows } = await admin
        .from('whatsapp_message_user_hides')
        .select('message_id')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('auth_user_id', session.user.id)
        .in('message_id', messageIds.slice(0, 50000));
      (hiddenRows || []).forEach((row: any) => hiddenIds.add(String(row.message_id)));
    }

    const sentByIds = Array.from(new Set((messages || [])
      .map((message: any) => String(message.sent_by || ''))
      .filter(Boolean)));
    const senderNames = new Map<string, string>();
    if (sentByIds.length) {
      for (let index = 0; index < sentByIds.length; index += 500) {
        const batch = sentByIds.slice(index, index + 500);
        const { data: profileRows } = await admin
          .from('profiles')
          .select('auth_user_id,full_name')
          .eq('law_firm_id', profile.law_firm_id)
          .in('auth_user_id', batch);
        (profileRows || []).forEach((row: any) => senderNames.set(String(row.auth_user_id), String(row.full_name || '')));
      }
    }

    const messageRows = messages.filter((message: any) => !hiddenIds.has(String(message.id)));
    const messageByConversation = new Map<string, any[]>();
    for (const message of messageRows) {
      const conversationId = String(message.conversation_id || '');
      const bucket = messageByConversation.get(conversationId) || [];
      bucket.push(message);
      messageByConversation.set(conversationId, bucket);
    }

    const payload = conversations.map((conversation: any) => ({
      conversation: {
        id: conversation.id,
        phone: conversation.phone,
        lead_name: conversation.lead_name,
        department: conversation.department,
        status: conversation.status,
        closed_at: conversation.closed_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        client_id: conversation.client_id,
        assigned_to: conversation.assigned_to,
        tags: Array.isArray(conversation.tags) ? conversation.tags : [],
      },
      messages: (messageByConversation.get(String(conversation.id)) || []).map((message: any) => ({
        id: message.id,
        external_id: message.external_id,
        direction: message.direction,
        sender: message.direction === 'outbound'
          ? (senderNames.get(String(message.sent_by || '')) || message.sent_by || 'Escritório')
          : (conversation.lead_name || conversation.phone),
        type: messageTypeLabel(message),
        body: message.body,
        status: message.status,
        created_at: message.created_at,
        updated_at: message.updated_at,
        file_name: message.file_name,
        file_size: message.file_size,
        mime_type: message.mime_type,
        media_url: message.media_url,
        transcription_text: message.transcription_text || null,
        reaction: message.client_reaction_emoji || null,
        deleted_for_all: Boolean(message.deleted_for_all),
        remote_deleted_at: message.remote_deleted_at || null,
        remote_deleted_by: message.remote_deleted_by || null,
        remote_delete_source: message.remote_delete_source || null,
      })),
    }));

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'csv') {
      const rows: string[] = [[
        'conversation_id','phone','lead_name','department','status','message_id','external_id','direction','sender','type','body','status_message','created_at','updated_at','file_name','file_size','mime_type','media_url','transcription','deleted_for_all','remote_deleted_at','remote_deleted_by','remote_delete_source'
      ].map(csvCell).join(',')];
      for (const item of payload) {
        for (const message of item.messages) {
          rows.push([
            item.conversation.id,
            item.conversation.phone,
            item.conversation.lead_name,
            item.conversation.department,
            item.conversation.status,
            message.id,
            message.external_id,
            message.direction,
            message.sender,
            message.type,
            message.body,
            message.status,
            message.created_at,
            message.updated_at,
            message.file_name,
            message.file_size,
            message.mime_type,
            message.media_url,
            message.transcription_text,
            message.deleted_for_all,
            message.remote_deleted_at,
            message.remote_deleted_by,
            message.remote_delete_source,
          ].map(csvCell).join(','));
        }
      }
      return new NextResponse(`\ufeff${rows.join('\n')}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="advos-whatsapp-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse(JSON.stringify({
      exportedAt: new Date().toISOString(),
      count: payload.length,
      conversations: payload,
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="advos-whatsapp-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    const detail = error instanceof Error ? error.message : '';
    return NextResponse.json({
      ok: false,
      error: publicErrorMessage(error, 'Não foi possível exportar as conversas.'),
      detail,
    }, { status });
  }
}
