export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { WhatsappCentralClient } from '@/components/WhatsappCentralClient';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { getOrCreateConversation } from '@/lib/whatsappApi';
import { clientIdFromVirtualConversationId, isVirtualConversationId, mergeClientContactsIntoConversations, syncClientContactsToConversations } from '@/lib/whatsappConversations';
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

async function materializeClientConversation(admin: any, lawFirmId: string, clientId: string) {
  if (!clientId) return '';
  const { data: client } = await admin
    .from('clients')
    .select('id,name,phone,whatsapp')
    .eq('law_firm_id', lawFirmId)
    .eq('id', clientId)
    .maybeSingle();
  const phone = normalizeBrazilPhone(client?.whatsapp || client?.phone || '');
  if (!client?.id || !phone) return '';
  const conversation = await getOrCreateConversation({ lawFirmId, clientId: client.id, phone, leadName: client.name });
  return conversation.id;
}

async function materializeSelectedConversation(admin: any, lawFirmId: string, selectedId: string) {
  if (!isVirtualConversationId(selectedId)) return selectedId;
  const clientId = clientIdFromVirtualConversationId(selectedId);
  return await materializeClientConversation(admin, lawFirmId, clientId) || selectedId;
}

export default async function WhatsAppCentral({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

  await ensureMessageTemplates(admin, profile.law_firm_id);

  const requestedId = query?.cliente
    ? await materializeClientConversation(admin, profile.law_firm_id, query.cliente)
    : await materializeSelectedConversation(admin, profile.law_firm_id, query?.conversa || '');

  const [{ data: integration }, { data: clients }, { data: templates }] = await Promise.all([
    admin.from('integration_settings').select('enabled,status,token_last4,raw_settings,webhook_secret,notes').eq('law_firm_id', profile.law_firm_id).eq('provider', 'whatsapp').maybeSingle(),
    admin
      .from('clients')
      .select('id,law_firm_id,name,phone,whatsapp,created_at,updated_at')
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

  await syncClientContactsToConversations(admin, profile.law_firm_id, clients || []);

  const { data: conversationsRaw } = await admin
    .from('whatsapp_conversations')
    .select('*, clients(id,name,whatsapp,phone)')
    .eq('law_firm_id', profile.law_firm_id)
    .order('last_message_at', { ascending: false })
    .limit(160);

  const conversations = mergeClientContactsIntoConversations(conversationsRaw || [], clients || []);
  const selectedId = requestedId || conversations?.[0]?.id || '';
  const selected = (conversations || []).find((item: any) => item.id === selectedId) || conversations?.[0] || null;
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
        subtitle="Central compacta com contatos dos clientes, busca, atualização automática e atalhos de modelos como /cobranca. Ctrl + Enter envia."
        action={<Link href="/app/integracoes" className="btn btn-secondary">Configurar API</Link>}
      />

      {!active && (
        <section className="card mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          WhatsApp API ainda não está totalmente configurado. Vá em Integrações, preencha Access Token e Phone Number ID, salve e teste a conexão.
        </section>
      )}

      <WhatsappCentralClient
        initialConversations={conversations || []}
        initialMessages={messages || []}
        initialSelectedId={selected?.id || ''}
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
