export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { WhatsappCentralClient } from '@/components/WhatsappCentralClient';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildClientContacts, clientIdFromVirtualConversationId, isVirtualConversationId, virtualConversationId } from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';


async function ensureMessageTemplates(admin: any, lawFirmId: string) {
  const { count } = await admin
    .from('message_templates')
    .select('id', { count: 'exact', head: true })
    .eq('law_firm_id', lawFirmId);

  if (!count) {
    await admin.from('message_templates').insert(
      DEFAULT_MESSAGE_TEMPLATES.map((template) => ({
        ...template,
        law_firm_id: lawFirmId,
        shortcut: `/${String(template.slug || template.name || 'modelo').replace(/^\/+/, '')}`,
      }))
    );
  }
}

async function clientConversationTarget(admin: any, lawFirmId: string, clientId: string) {
  if (!clientId) return '';
  const { data: client } = await admin
    .from('clients')
    .select('id,phone,whatsapp')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();
  const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
  if (!client?.id || !phone) return '';

  // Abrir pelo cliente deve funcionar como contato, sem poluir a aba Conversas.
  // A conversa real só aparece depois de enviar/receber mensagem.
  return virtualConversationId(client.id);
}

async function materializeSelectedConversation(admin: any, lawFirmId: string, selectedId: string) {
  if (!isVirtualConversationId(selectedId)) return selectedId;
  const clientId = clientIdFromVirtualConversationId(selectedId);
  return await clientConversationTarget(admin, lawFirmId, clientId) || selectedId;
}

async function getConversationIdsWithVisibleMessages(admin: any, lawFirmId: string) {
  const { data, error } = await admin
    .from('whatsapp_messages')
    .select('conversation_id')
    .eq('law_firm_id', lawFirmId)
    .is('deleted_at', null)
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row: any) => String(row.conversation_id)).filter(Boolean));
}

export default async function WhatsAppCentral({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

  await ensureMessageTemplates(admin, profile.law_firm_id);

  const requestedId = query?.cliente
    ? await clientConversationTarget(admin, profile.law_firm_id, query.cliente)
    : await materializeSelectedConversation(admin, profile.law_firm_id, query?.conversa || '');

  const initialDraft = String(query?.draft || query?.mensagem || '').trim();

  const [{ data: integration }, { data: clients }, { data: templates }] = await Promise.all([
    admin.from('integration_settings').select('enabled,status,token_last4,raw_settings,webhook_secret,notes').eq('law_firm_id', profile.law_firm_id).eq('provider', 'whatsapp').maybeSingle(),
    admin
      .from('clients')
      .select('id,law_firm_id,name,phone,whatsapp,created_at')
      .eq('law_firm_id', profile.law_firm_id)
      .or('phone.not.is.null,whatsapp.not.is.null')
      .order('name'),
    admin
      .from('message_templates')
      .select('id,name,slug,shortcut,body,category,active')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('active', true)
      .order('name'),
  ]);


  const { data: conversationsRaw } = await admin
    .from('whatsapp_conversations')
    .select('*, clients(id,name,whatsapp,phone)')
    .eq('law_firm_id', profile.law_firm_id)
    .order('last_message_at', { ascending: false })
    .limit(160);

  // Conversas reais ficam separadas dos contatos.
  // A aba Conversas mostra apenas conversas com mensagens visíveis.
  // Registros antigos sem mensagens ficam somente acessíveis via Contatos/busca.
  const allConversations = conversationsRaw || [];
  const conversationIdsWithMessages = await getConversationIdsWithVisibleMessages(admin, profile.law_firm_id);
  let conversations = allConversations
    .filter((conversation: any) => conversationIdsWithMessages.has(String(conversation.id)))
    .map((conversation: any) => ({ ...conversation, has_messages: true, message_count: 1 }));
  const contacts = buildClientContacts(conversations, clients || []);


  const selectedId = requestedId || conversations?.[0]?.id || '';
  const selected = (conversations || []).find((item: any) => item.id === selectedId)
    || (contacts || []).find((item: any) => item.id === selectedId || item.conversation_id === selectedId)
    || conversations?.[0]
    || null;
  const { data: messages } = selected && !selected.virtual
    ? await admin
        .from('whatsapp_messages')
        .select('*')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', selected.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
    : { data: [] as any[] };

  const active = Boolean(integration?.enabled && integration?.token_last4 && integration?.raw_settings?.phone_number_id);

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Atendimento centralizado com conversas, contatos e modelos de mensagem."
        action={<Link href="/app/integracoes" className="btn btn-secondary">Configurar integração</Link>}
      />

      {!active && (
        <section className="card mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          A integração do WhatsApp ainda não está concluída. Acesse Integrações para revisar a configuração e testar a conexão.
        </section>
      )}

      <WhatsappCentralClient
        initialConversations={conversations || []}
        initialMessages={messages || []}
        initialSelectedId={selected?.id || ''}
        initialContacts={contacts || []}
        initialDraft={initialDraft}
        templates={((templates && templates.length ? templates : DEFAULT_MESSAGE_TEMPLATES) || []).map((template: any) => ({
          id: String(template.id || template.slug || template.name),
          name: String(template.name || ''),
          slug: String(template.slug || ''),
          shortcut: String(template.shortcut || ''),
          category: String(template.category || ''),
          body: String(template.body || ''),
        }))}
      />
    </div>
  );
}
