export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { MessageTemplatesManager } from '@/components/MessageTemplatesManager';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';

async function ensureDefaults(admin: any, lawFirmId: string) {
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

export default async function ModelosMensagens() {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  await ensureDefaults(admin, profile.law_firm_id);

  const { data: templates, error } = await admin
    .from('message_templates')
    .select('*')
    .eq('law_firm_id', profile.law_firm_id)
    .order('category')
    .order('name');

  return (
    <div>
      <PageHeader
        title="Modelos de mensagem"
        subtitle="Crie, edite e salve atalhos como /cobranca para usar dentro da central do WhatsApp."
      />

      {error && (
        <section className="panel mb-4 border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
          Erro ao carregar modelos: {error.message}. Rode o SQL V9.8 no Supabase e atualize a página.
        </section>
      )}

      <MessageTemplatesManager initialTemplates={(templates || []).map((template: any) => ({
        id: String(template.id),
        name: String(template.name || ''),
        slug: String(template.slug || ''),
        shortcut: String(template.shortcut || `/${template.slug || ''}`),
        category: String(template.category || 'geral'),
        body: String(template.body || ''),
        active: template.active !== false,
        meta_template_name: template.meta_template_name ? String(template.meta_template_name) : '',
        meta_template_language: template.meta_template_language ? String(template.meta_template_language) : 'pt_BR',
      }))} />
    </div>
  );
}
