import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { clientIdFromVirtualConversationId, isVirtualConversationId, virtualConversationId } from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

async function resolveConversation(admin: any, lawFirmId: string, requestedId: string) {
  if (!requestedId) return null;

  if (isVirtualConversationId(requestedId)) {
    const clientId = clientIdFromVirtualConversationId(requestedId);
    if (!clientId) return null;

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id,law_firm_id,name,phone,whatsapp')
      .eq('law_firm_id', lawFirmId)
      .eq('id', clientId)
      .maybeSingle();

    if (clientError) throw new Error(clientError.message);

    const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
    if (!client?.id || !phone) return null;

    // Contato virtual: não criamos conversa real só por abrir/pesquisar o cliente.
    // A conversa real só nasce quando uma mensagem é enviada ou recebida.
    return {
      id: virtualConversationId(client.id),
      law_firm_id: lawFirmId,
      client_id: client.id,
      phone,
      lead_name: client.name || phone,
      status: 'contato',
      last_message_at: null,
      unread_count: 0,
      virtual: true,
      clients: { id: client.id, name: client.name, whatsapp: client.whatsapp, phone: client.phone },
    };
  }

  const { data: conversation, error } = await admin
    .from('whatsapp_conversations')
    .select('*, clients(id,name,whatsapp,phone)')
    .eq('law_firm_id', lawFirmId)
    .eq('id', requestedId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return conversation || null;
}

export async function GET(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const url = new URL(req.url);
    const requestedId = String(url.searchParams.get('conversationId') || '').trim();

    const conversation = await resolveConversation(admin, profile.law_firm_id, requestedId);
    if (!conversation?.id) {
      return NextResponse.json({ ok: true, conversationId: '', conversation: null, messages: [], fetchedAt: new Date().toISOString() }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      });
    }

    if (conversation.virtual) {
      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        conversation,
        messages: [],
        fetchedAt: new Date().toISOString(),
      }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
    }

    const { data: messages, error } = await admin
      .from('whatsapp_messages')
      .select('*')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('conversation_id', conversation.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    if (Number(conversation.unread_count || 0) > 0) {
      await admin
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
        .eq('law_firm_id', profile.law_firm_id);
    }

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      conversation,
      messages: messages || [],
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar mensagens.' }, { status: 400 });
  }
}
