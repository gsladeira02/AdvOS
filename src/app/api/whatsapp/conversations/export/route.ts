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
    const scope = str(body.scope || 'one');
    const format = str(body.format || 'json') === 'csv' ? 'csv' : 'json';
    const currentConversationId = str(body.conversationId);
    const requestedIds: string[] = Array.isArray(body.conversationIds) ? Array.from(new Set<string>(body.conversationIds.map(str).filter(Boolean))) : [];
    let conversationIds: string[] | null = null;
    if (scope === 'one') {
      if (!currentConversationId) throw new SecurityError('Conversa não informada.', 400);
      conversationIds = [currentConversationId];
    } else if (scope === 'selected') {
      if (!requestedIds.length) throw new SecurityError('Selecione ao menos uma conversa.', 400);
      conversationIds = requestedIds.slice(0, 500);
    } else if (scope !== 'all') {
      throw new SecurityError('Escopo de exportação inválido.', 400);
    }

    let conversationQuery = admin.from('whatsapp_conversations').select('id,law_firm_id,client_id,phone,lead_name,department,status,closed_at,created_at,updated_at,assigned_to,tags').eq('law_firm_id', profile.law_firm_id);
    if (conversationIds) conversationQuery = conversationQuery.in('id', conversationIds);
    const { data: conversations, error: conversationError } = await conversationQuery.order('updated_at', { ascending: true });
    if (conversationError) throw new Error(conversationError.message);
    if (!conversations?.length) throw new SecurityError('Nenhuma conversa encontrada para exportação.', 404);

    const ids = conversations.map((item: any) => item.id);
    const { data: messages, error: messagesError } = await admin.from('whatsapp_messages').select('id,conversation_id,direction,message_type,body,external_id,status,created_at,updated_at,file_name,file_size,mime_type,media_url,sent_by,sent_by_name,deleted_at,deleted_for_all,remote_deleted_at,remote_deleted_by,remote_delete_source,transcription_text,client_reaction_emoji').eq('law_firm_id', profile.law_firm_id).in('conversation_id', ids).order('created_at', { ascending: true });
    if (messagesError) throw new Error(messagesError.message);

    const hiddenIds = new Set<string>();
    const messageIds = (messages || []).map((item: any) => item.id).filter(Boolean);
    if (messageIds.length) {
      const { data: hiddenRows } = await admin.from('whatsapp_message_user_hides').select('message_id').eq('law_firm_id', profile.law_firm_id).eq('auth_user_id', session.user.id).in('message_id', messageIds.slice(0, 50000));
      (hiddenRows || []).forEach((row: any) => hiddenIds.add(String(row.message_id)));
    }

    const messageRows = (messages || []).filter((message: any) => !hiddenIds.has(String(message.id)));
    const payload = (conversations || []).map((conversation: any) => ({
      conversation: { id: conversation.id, phone: conversation.phone, lead_name: conversation.lead_name, department: conversation.department, status: conversation.status, closed_at: conversation.closed_at, created_at: conversation.created_at, updated_at: conversation.updated_at, client_id: conversation.client_id, assigned_to: conversation.assigned_to, tags: conversation.tags || [] },
      messages: messageRows.filter((message: any) => String(message.conversation_id) === String(conversation.id)).map((message: any) => ({
        id: message.id,
        external_id: message.external_id,
        direction: message.direction,
        sender: message.direction === 'outbound' ? (message.sent_by_name || message.sent_by || 'Escritório') : (conversation.lead_name || conversation.phone),
        type: messageTypeLabel(message),
        body: message.body,
        status: message.status,
        created_at: message.created_at,
        updated_at: message.updated_at,
        file_name: message.file_name,
        file_size: message.file_size,
        mime_type: message.mime_type,
        media_url: message.media_url,
        transcription_text: message.transcription_text,
        reaction: message.client_reaction_emoji,
        deleted_for_all: Boolean(message.deleted_for_all),
        remote_deleted_at: message.remote_deleted_at || null,
        remote_delete_source: message.remote_delete_source || null,
      })),
    }));

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'csv') {
      const rows: string[] = [['conversation_id','phone','lead_name','department','status','message_id','external_id','direction','sender','type','body','status_message','created_at','updated_at','file_name','file_size','mime_type','media_url','transcription','deleted_for_all','remote_deleted_at','remote_delete_source'].map(csvCell).join(',')];
      for (const item of payload) for (const message of item.messages) rows.push([
        item.conversation.id,item.conversation.phone,item.conversation.lead_name,item.conversation.department,item.conversation.status,
        message.id,message.external_id,message.direction,message.sender,message.type,message.body,message.status,message.created_at,message.updated_at,
        message.file_name,message.file_size,message.mime_type,message.media_url,message.transcription_text,message.deleted_for_all,message.remote_deleted_at,message.remote_delete_source,
      ].map(csvCell).join(','));
      return new NextResponse(`\ufeff${rows.join('\n')}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="advos-whatsapp-${stamp}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), count: payload.length, conversations: payload }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="advos-whatsapp-${stamp}.json"`, 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    const status = error instanceof SecurityError ? error.status : 400;
    return NextResponse.json({ ok: false, error: publicErrorMessage(error, 'Não foi possível exportar as conversas.') }, { status });
  }
}
