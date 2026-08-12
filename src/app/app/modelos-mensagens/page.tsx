export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/messageTemplates';

const variables = [
  '{{cliente}}',
  '{{primeiro_nome}}',
  '{{usuario}}',
  '{{usuario_nome_completo}}',
  '{{servico}}',
  '{{parcela}}',
  '{{valor}}',
  '{{vencimento}}',
  '{{link_asaas}}',
  '{{link_zapsign}}',
  '{{linha_link_asaas}}',
  '{{escritorio}}',
  '{{telefone_escritorio}}',
];

function message(code?: string) {
  if (code === 'salvo') return { cls: 'border-green-200 bg-green-50 text-green-800', text: 'Modelo salvo com sucesso.' };
  if (code === 'apagado') return { cls: 'border-green-200 bg-green-50 text-green-800', text: 'Modelo apagado com sucesso.' };
  return null;
}

async function ensureDefaults(admin: any, lawFirmId: string) {
  const { count } = await admin
    .from('message_templates')
    .select('id', { count: 'exact', head: true })
    .eq('law_firm_id', lawFirmId);

  if (!count) {
    await admin.from('message_templates').insert(
      DEFAULT_MESSAGE_TEMPLATES.map((t) => ({ ...t, law_firm_id: lawFirmId }))
    );
  }
}

export default async function ModelosMensagens({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  await ensureDefaults(admin, profile.law_firm_id);

  const { data: templates } = await admin
    .from('message_templates')
    .select('*')
    .eq('law_firm_id', profile.law_firm_id)
    .order('category')
    .order('name');

  const ok = message(query?.ok);
  const error = query?.erro;

  return (
    <div>
      <PageHeader
        title="Modelos de mensagem"
        subtitle="Cadastre mensagens prontas e atalhos como /cobranca para enviar modelos direto na central do WhatsApp."
      />

      {ok && <section className={`card mb-6 border p-4 text-sm font-bold ${ok.cls}`}>{ok.text}</section>}
      {error && <section className="card mb-6 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">Erro: {error}</section>}

      <section className="card mb-6 p-5">
        <h2 className="text-base font-black">Variáveis disponíveis</h2>
        <p className="mt-2 text-sm text-slate-600">Use essas variáveis no texto. Na hora do envio, o AdvOS substitui automaticamente.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {variables.map((v) => <code key={v} className="rounded-xl border border-[#eee4d4] bg-[#fbf7ef] px-3 py-2 text-xs font-black text-slate-700">{v}</code>)}
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="text-base font-black">Novo modelo</h2>
        <form action="/api/message-templates" method="post" className="mt-4 grid gap-4">
          <input type="hidden" name="intent" value="save" />
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_120px]">
            <input className="input" name="name" placeholder="Nome do modelo" required />
            <input className="input" name="shortcut" placeholder="Atalho, ex: /cobranca" />
            <select className="input" name="category" defaultValue="cobranca">
              <option value="cobranca">Cobrança</option>
              <option value="contrato">Contrato</option>
              <option value="assinatura">Assinatura</option>
              <option value="documentos">Documentos</option>
              <option value="atendimento">Atendimento</option>
              <option value="lead">Lead</option>
            </select>
            <select className="input" name="active" defaultValue="true">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <textarea className="input min-h-[150px]" name="body" placeholder="Digite a mensagem usando variáveis como {{primeiro_nome}}, {{valor}}, {{vencimento}} e {{link_asaas}}" required />
          <button className="btn btn-primary">Salvar novo modelo</button>
        </form>
      </section>

      <div className="space-y-4">
        {(templates || []).map((template: any) => (
          <section className="card p-5" key={template.id}>
            <form action="/api/message-templates" method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="save" />
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="slug" value={template.slug || ''} />
              <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_120px]">
                <input className="input font-black" name="name" defaultValue={template.name || ''} />
                <input className="input" name="shortcut" defaultValue={template.shortcut || `/${template.slug || ''}`} placeholder="/atalho" />
                <select className="input" name="category" defaultValue={template.category || 'geral'}>
                  <option value="cobranca">Cobrança</option>
                  <option value="contrato">Contrato</option>
                  <option value="assinatura">Assinatura</option>
                  <option value="documentos">Documentos</option>
                  <option value="atendimento">Atendimento</option>
                  <option value="lead">Lead</option>
                  <option value="geral">Geral</option>
                </select>
                <select className="input" name="active" defaultValue={template.active ? 'true' : 'false'}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
              <textarea className="input min-h-[140px]" name="body" defaultValue={template.body || ''} />
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary">Salvar alterações</button>
                <button formAction="/api/message-templates" name="intent" value="delete" className="btn btn-secondary" formNoValidate>Apagar modelo</button>
              </div>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
