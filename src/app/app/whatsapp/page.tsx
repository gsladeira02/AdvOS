export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { WhatsappCentralClient } from '@/components/WhatsappCentralClient';
import { getCurrentProfile, isAdminRole } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildClientContacts, clientIdFromVirtualConversationId, enrichMessagesWithSenderProfiles, isVirtualConversationId, loadVisibleConversations, virtualConversationId } from '@/lib/whatsappConversations';
import { normalizeBrazilPhone } from '@/lib/whatsapp';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';
import { loadWhatsappSettings } from '@/lib/whatsappSettings';


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

export default async function WhatsAppCentral({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { session, profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const canConfigure = isAdminRole(profile.role);

  await ensureMessageTemplates(admin, profile.law_firm_id);

  const requestedId = query?.cliente
    ? await clientConversationTarget(admin, profile.law_firm_id, query.cliente)
    : await materializeSelectedConversation(admin, profile.law_firm_id, query?.conversa || '');

  const initialDraft = String(query?.draft || query?.mensagem || '').trim();
  const requestedView = String(query?.view || '').trim();
  const initialSettingsSection = String(query?.section || 'tags').trim();
  const requestedTab = String(query?.tab || '').trim();
  const initialTab = requestedTab === 'leads' || requestedTab === 'contatos' || requestedTab === 'conversas' ? requestedTab : '';

  const [{ data: integration }, { data: clients }, { data: templates }, { data: teamProfiles }] = await Promise.all([
    admin.from('integration_settings').select('enabled,status,token_last4,raw_settings,webhook_secret,notes').eq('law_firm_id', profile.law_firm_id).eq('provider', 'whatsapp').maybeSingle(),
    admin
      .from('clients')
      .select('id,law_firm_id,name,phone,whatsapp,created_at')
      .eq('law_firm_id', profile.law_firm_id)
      .or('phone.not.is.null,whatsapp.not.is.null')
      .order('name'),
    admin
      .from('message_templates')
      .select('id,name,slug,shortcut,body,category,active,meta_template_name,meta_template_language')
      .eq('law_firm_id', profile.law_firm_id)
      .order('name'),
    admin
      .from('profiles')
      .select('auth_user_id,full_name,email,role,status')
      .eq('law_firm_id', profile.law_firm_id)
      .order('full_name'),
  ]);

  const whatsappSettings = await loadWhatsappSettings(admin, profile.law_firm_id);

  // Conversas reais ficam separadas dos contatos e são derivadas das
  // mensagens visíveis. Assim, uma mensagem recebida sempre promove a conversa.
  const conversations = await loadVisibleConversations(admin, profile.law_firm_id, 500);
  const contacts = buildClientContacts(conversations, clients || []);


  const selectedId = requestedId || '';
  const selected = selectedId
    ? ((conversations || []).find((item: any) => item.id === selectedId)
      || (contacts || []).find((item: any) => item.id === selectedId || item.conversation_id === selectedId)
      || null)
    : null;
  const requestedAllowedView = requestedView === 'financeiro_juridico' || requestedView === 'atendimento' || requestedView === 'encerrados' || (requestedView === 'configuracoes' && canConfigure)
    ? requestedView
    : '';
  const initialView = requestedAllowedView
    ? requestedAllowedView
    : selected?.closed_at
      ? 'encerrados'
      : selected?.department === 'financeiro_juridico'
        ? 'financeiro_juridico'
        : 'atendimento';

  const { data: rawMessages } = selected && !selected.virtual
    ? await admin
        .from('whatsapp_messages')
        .select('*')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', selected.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
    : { data: [] as any[] };
  const initialMessageIds = (rawMessages || []).map((row: any) => row.id).filter(Boolean);
  const { data: initialHiddenRows } = initialMessageIds.length
    ? await admin
        .from('whatsapp_message_user_hides')
        .select('message_id')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('auth_user_id', session.user.id)
        .in('message_id', initialMessageIds)
    : { data: [] as any[] };
  const initialHiddenIds = new Set((initialHiddenRows || []).map((row: any) => String(row.message_id)));
  const visibleRawMessages = (rawMessages || []).filter((row: any) => !initialHiddenIds.has(String(row.id)));
  const messages = selected && !selected.virtual
    ? await enrichMessagesWithSenderProfiles(admin, profile.law_firm_id, visibleRawMessages)
    : [];

  const active = Boolean(integration?.enabled && integration?.token_last4 && integration?.raw_settings?.phone_number_id);

  return (
    <div className="whatsapp-page">
      <PageHeader
        title="WhatsApp"
        subtitle={`Atendimento, Financeiro/Jurídico e Encerrados com ${String(whatsappSettings.preferences?.lead_label_plural || 'Leads').toLowerCase()}, tags, clientes e histórico centralizado.`}
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
        teamUsers={teamProfiles || []}
        currentUserId={String(profile.auth_user_id || '')}
        currentUserName={String(profile.full_name || '')}
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
          active: template.active !== false,
          meta_template_name: template.meta_template_name || '',
          meta_template_language: template.meta_template_language || 'pt_BR',
        })) as any}
        initialTags={whatsappSettings.tags || []}
        initialLeadStages={whatsappSettings.stages || []}
        initialPreferences={whatsappSettings.preferences || {}}
        initialAutoReplies={whatsappSettings.autoReplies || []}
        initialLeadTracking={whatsappSettings.leadTracking || null}
        initialView={initialView as any}
        initialTab={initialTab as any}
        initialSettingsSection={initialSettingsSection}
        canConfigure={canConfigure}
      />
    </div>
  );
}
