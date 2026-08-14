export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function integrationStatus(row: any) {
  if (!row?.enabled) return { label: 'desativada', cls: 'badge-warn' };
  if (row?.status === 'testado' || row?.status === 'webhook_configurado') return { label: 'ativa', cls: 'badge-ok' };
  if (row?.token_last4) return { label: 'configurada', cls: 'badge-info' };
  return { label: 'sem chave', cls: 'badge-danger' };
}

function statusMessage(kind: 'asaas' | 'whatsapp', code?: string) {
  if (!code) return null;
  const names = { asaas: 'Asaas', whatsapp: 'WhatsApp' } as const;
  const name = names[kind];
  if (code === 'testado') return { cls: 'border-green-200 bg-green-50 text-green-800', text: `Conexão com o ${name} testada com sucesso.` };
  if (code === 'webhook_configurado') return { cls: 'border-green-200 bg-green-50 text-green-800', text: `Webhook do ${name} configurado com sucesso.` };
  if (code === 'sem_chave') return { cls: 'border-amber-200 bg-amber-50 text-amber-800', text: `Ative a integração e salve a chave do ${name} antes de testar.` };
  if (code === 'erro_teste') return { cls: 'border-red-200 bg-red-50 text-red-800', text: `Não foi possível testar a conexão com o ${name}. Confira a chave e os dados.` };
  if (code === 'erro_webhook') return { cls: 'border-red-200 bg-red-50 text-red-800', text: `Não foi possível configurar o webhook do ${name}. Confira a chave, ambiente e URL do app.` };
  return null;
}

export default async function Integracoes({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const { data: rows } = await admin
    .from('integration_settings')
    .select('provider,enabled,environment,token_last4,api_base_url,webhook_secret,default_billing_type,status,notes,updated_at,raw_settings')
    .eq('law_firm_id', profile.law_firm_id);

  const zapsign = (rows || []).find((r: any) => r.provider === 'zapsign');
  const asaas = (rows || []).find((r: any) => r.provider === 'asaas');
  const whatsapp = (rows || []).find((r: any) => r.provider === 'whatsapp');
  const openai = (rows || []).find((r: any) => r.provider === 'openai');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.vercel.app';
  const zapStatus = integrationStatus(zapsign);
  const asaasStatus = integrationStatus(asaas);
  const whatsappStatus = integrationStatus(whatsapp);
  const openaiStatus = integrationStatus(openai);
  const asaasMsg = statusMessage('asaas', query?.asaas);
  const whatsappMsg = statusMessage('whatsapp', query?.whatsapp);
  const whatsappRaw = whatsapp?.raw_settings || {};
  const openaiRaw = openai?.raw_settings || {};

  return (
    <div>
      <PageHeader title="Integrações" subtitle="Conecte assinatura digital, cobrança e WhatsApp oficial sem expor as chaves na interface." />

      {asaasMsg && <section className={`card mb-6 border p-4 text-sm font-bold ${asaasMsg.cls}`}>{asaasMsg.text}</section>}
      {whatsappMsg && <section className={`card mb-6 border p-4 text-sm font-bold ${whatsappMsg.cls}`}>{whatsappMsg.text}</section>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="label">Assinatura digital</p>
              <h2 className="mt-2 text-xl font-black">ZapSign</h2>
              <p className="mt-2 text-sm text-slate-600">Use para enviar procurações, contratos de honorários, acordos e documentos para assinatura.</p>
            </div>
            <span className={`badge shrink-0 ${zapStatus.cls}`}>{zapStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="provider" value="zapsign" />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Ambiente</label>
                <select name="environment" defaultValue={zapsign?.environment || 'sandbox'} className="input mt-1">
                  <option value="sandbox">Sandbox/testes</option>
                  <option value="producao">Produção</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="enabled" defaultValue={zapsign?.enabled ? 'true' : 'false'} className="input mt-1">
                  <option value="false">Desativada</option>
                  <option value="true">Ativada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Token da API</label>
              <input name="api_token" type="password" className="input mt-1" placeholder={zapsign?.token_last4 ? `Chave salva terminando em ${zapsign.token_last4}` : 'Cole o token da ZapSign'} />
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter a chave atual.</p>
            </div>

            <div>
              <label className="label">Base URL</label>
              <input name="api_base_url" className="input mt-1 bg-slate-50" readOnly value="https://api.zapsign.com.br/api/v1" />
            </div>

            <div>
              <label className="label">Webhook no ZapSign</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/zapsign`} />
            </div>

            {zapsign?.webhook_secret && (
              <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-xs text-slate-600">
                <p className="font-black text-slate-900">Autenticação do webhook ZapSign</p>
                <p className="mt-1">Cadastre um cabeçalho personalizado no webhook da ZapSign:</p>
                <div className="mt-2 grid gap-2">
                  <input className="input bg-white" readOnly value="X-AdvOS-Webhook-Token" aria-label="Nome do cabeçalho do webhook ZapSign" />
                  <input className="input bg-white font-mono text-xs" readOnly value={zapsign.webhook_secret} aria-label="Token do webhook ZapSign" />
                </div>
              </div>
            )}

            <button className="btn btn-primary">Salvar ZapSign</button>
          </form>
        </section>

        <section className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="label">Cobranças</p>
              <h2 className="mt-2 text-xl font-black">Asaas</h2>
              <p className="mt-2 text-sm text-slate-600">Gere cobranças de honorários, parcelas, Pix e boleto a partir da pasta do cliente ou do financeiro.</p>
            </div>
            <span className={`badge shrink-0 ${asaasStatus.cls}`}>{asaasStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="provider" value="asaas" />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Ambiente</label>
                <select name="environment" defaultValue={asaas?.environment || 'sandbox'} className="input mt-1">
                  <option value="sandbox">Sandbox/testes</option>
                  <option value="producao">Produção</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="enabled" defaultValue={asaas?.enabled ? 'true' : 'false'} className="input mt-1">
                  <option value="false">Desativada</option>
                  <option value="true">Ativada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">API Key do Asaas</label>
              <input name="api_token" type="password" className="input mt-1" placeholder={asaas?.token_last4 ? `Chave salva terminando em ${asaas.token_last4}` : 'Cole a API Key do Asaas'} />
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter a chave atual.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Tipo padrão</label>
                <select name="default_billing_type" defaultValue={asaas?.default_billing_type || 'BOLETO'} className="input mt-1">
                  <option value="BOLETO">Boleto</option>
                  <option value="PIX">Pix</option>
                  <option value="UNDEFINED">Cliente escolhe</option>
                </select>
              </div>
              <div>
                <label className="label">Base URL</label>
                <input name="api_base_url" className="input mt-1 bg-slate-50" readOnly value={asaas?.environment === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'} />
              </div>
            </div>

            <div>
              <label className="label">Token do webhook</label>
              <input name="webhook_secret" type="password" className="input mt-1" placeholder={asaas?.webhook_secret ? "Token salvo. Deixe vazio para manter." : "Token para validar eventos do Asaas"} />
            </div>

            <div>
              <label className="label">Webhook no Asaas</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/asaas`} />
            </div>

            {asaas?.notes && <p className="break-safe rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-xs text-slate-600"><b>Último retorno:</b> {asaas.notes}</p>}

            <button className="btn btn-primary">Salvar Asaas</button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <form action="/api/asaas/test" method="post"><button className="btn btn-secondary">Testar conexão</button></form>
            <form action="/api/asaas/create-webhook" method="post"><button className="btn btn-secondary">Criar webhook</button></form>
            <Link href="/app/integracoes/asaas/importar" className="btn btn-primary">Importação inicial</Link>
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="label">Atendimento</p>
              <h2 className="mt-2 text-xl font-black">WhatsApp API</h2>
              <p className="mt-2 text-sm text-slate-600">Conecte a Cloud API oficial para enviar mensagens pelo AdvOS e receber respostas no sistema.</p>
            </div>
            <span className={`badge shrink-0 ${whatsappStatus.cls}`}>{whatsappStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="provider" value="whatsapp" />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Ambiente</label>
                <select name="environment" defaultValue={whatsapp?.environment || 'producao'} className="input mt-1">
                  <option value="sandbox">Testes</option>
                  <option value="producao">Produção</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="enabled" defaultValue={whatsapp?.enabled ? 'true' : 'false'} className="input mt-1">
                  <option value="false">Desativada</option>
                  <option value="true">Ativada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Access Token permanente</label>
              <input name="api_token" type="password" className="input mt-1" placeholder={whatsapp?.token_last4 ? `Token salvo terminando em ${whatsapp.token_last4}` : 'Cole o token permanente da Meta'} />
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter o token atual. Use token com permissão whatsapp_business_messaging.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Phone Number ID</label>
                <input name="phone_number_id" className="input mt-1" defaultValue={whatsappRaw.phone_number_id || ''} placeholder="ID do número na Meta" />
              </div>
              <div>
                <label className="label">WABA ID</label>
                <input name="waba_id" className="input mt-1" defaultValue={whatsappRaw.waba_id || ''} placeholder="WhatsApp Business Account ID" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Número oficial</label>
                <input name="business_phone" className="input mt-1" defaultValue={whatsappRaw.business_phone || ''} placeholder="5527999999999" />
              </div>
              <div>
                <label className="label">Versão Graph API</label>
                <input name="graph_version" className="input mt-1" defaultValue={whatsappRaw.graph_version || 'v26.0'} />
              </div>
            </div>

            <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3">
              <p className="text-xs font-black text-slate-950">Nome e foto do número</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                O nome de exibição e a foto do número são alterados no WhatsApp Manager da Meta, em Números de telefone → Perfil. O AdvOS salva estes campos apenas como referência interna para não confundir o atendimento.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input name="profile_display_name" className="input" defaultValue={whatsappRaw.profile_display_name || ''} placeholder="Nome desejado, ex: Ladeira Advogados" />
                <input name="profile_picture_note" className="input" defaultValue={whatsappRaw.profile_picture_note || ''} placeholder="Foto: use no WhatsApp Manager → Perfil" />
              </div>
            </div>

            <div>
              <label className="label">Base URL</label>
              <input name="api_base_url" className="input mt-1 bg-slate-50" readOnly value={`https://graph.facebook.com/${whatsappRaw.graph_version || 'v26.0'}`} />
            </div>

            <div>
              <label className="label">Verify Token do webhook</label>
              <input name="webhook_secret" className="input mt-1" defaultValue={whatsapp?.webhook_secret || ''} placeholder="Crie um token secreto para validar o webhook" />
            </div>

            <div>
              <label className="label">Webhook na Meta</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/whatsapp`} />
              <p className="mt-2 text-xs text-slate-500">Use esta URL no Meta Developers e assine o campo messages. Em produção, configure também WHATSAPP_APP_SECRET na Vercel para validar X-Hub-Signature-256.</p>
            </div>

            {whatsapp?.notes && <p className="break-safe rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-xs text-slate-600"><b>Último retorno:</b> {whatsapp.notes}</p>}

            <button className="btn btn-primary">Salvar WhatsApp</button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <form action="/api/whatsapp/test" method="post"><button className="btn btn-secondary">Testar conexão</button></form>
            <Link href="/app/whatsapp" className="btn btn-primary">Abrir central</Link>
          </div>

          <div className="mt-4 rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-xs text-slate-600">
            <b>Atenção:</b> mensagens livres pela API funcionam dentro da janela de atendimento de 24h. Fora dela, a Meta pode exigir template oficial aprovado.
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="label">Inteligência artificial</p>
              <h2 className="mt-2 text-xl font-black">Transcrição de áudios</h2>
              <p className="mt-2 text-sm text-slate-600">Transcreva mensagens de voz do WhatsApp dentro do AdvOS. A chave fica salva apenas no servidor e nunca é enviada ao navegador.</p>
            </div>
            <span className={`badge shrink-0 ${openaiStatus.cls}`}>{openaiStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="provider" value="openai" />
            <input type="hidden" name="environment" value="producao" />
            <div>
              <label className="label">Status</label>
              <select name="enabled" defaultValue={openai?.enabled ? 'true' : 'false'} className="input mt-1">
                <option value="false">Desativada</option>
                <option value="true">Ativada</option>
              </select>
            </div>

            <div>
              <label className="label">OpenAI API Key</label>
              <input name="api_token" type="password" className="input mt-1" placeholder={openai?.token_last4 ? `Chave salva terminando em ${openai.token_last4}` : 'Cole a sua OpenAI API Key'} />
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter a chave atual. Também é possível usar OPENAI_API_KEY na Vercel.</p>
            </div>

            <div>
              <label className="label">Modelo de transcrição</label>
              <select name="transcription_model" defaultValue={openaiRaw.transcription_model || 'gpt-transcribe'} className="input mt-1">
                <option value="gpt-transcribe">GPT Transcribe — recomendado</option>
                <option value="gpt-4o-transcribe">GPT-4o Transcribe — alta precisão</option>
                <option value="gpt-4o-mini-transcribe">GPT-4o mini Transcribe — econômico</option>
              </select>
            </div>

            <div>
              <label className="label">Base URL</label>
              <input name="api_base_url" className="input mt-1 bg-slate-50" readOnly value="https://api.openai.com/v1" />
            </div>

            <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-xs leading-relaxed text-slate-600">
              A transcrição é feita somente quando alguém clica em <b>Transcrever áudio</b>. O resultado fica salvo na mensagem para não processar o mesmo áudio novamente.
            </div>

            <button className="btn btn-primary">Salvar transcrição</button>
          </form>
        </section>
      </div>
    </div>
  );
}
