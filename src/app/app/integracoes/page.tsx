export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function integrationStatus(row: any) {
  if (!row?.enabled) return { label: 'desativada', cls: 'badge-warn' };
  if (row?.status === 'testado' || row?.status === 'webhook_configurado') return { label: 'ativa', cls: 'badge-ok' };
  if (row?.token_last4) return { label: 'configurada', cls: 'badge-info' };
  return { label: 'sem chave', cls: 'badge-danger' };
}

function asaasMessage(code?: string) {
  if (code === 'testado') return { cls: 'border-green-200 bg-green-50 text-green-800', text: 'Conexão com o Asaas testada com sucesso.' };
  if (code === 'webhook_configurado') return { cls: 'border-green-200 bg-green-50 text-green-800', text: 'Webhook do Asaas configurado com sucesso.' };
  if (code === 'sem_chave') return { cls: 'border-amber-200 bg-amber-50 text-amber-800', text: 'Ative a integração e salve uma API Key do Asaas antes de testar ou criar webhook.' };
  if (code === 'erro_teste') return { cls: 'border-red-200 bg-red-50 text-red-800', text: 'Não foi possível testar a conexão com o Asaas. Confira a API Key e o ambiente.' };
  if (code === 'erro_webhook') return { cls: 'border-red-200 bg-red-50 text-red-800', text: 'Não foi possível criar o webhook no Asaas. Confira a API Key, ambiente e URL do app.' };
  return null;
}

export default async function Integracoes({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const { data: rows } = await admin
    .from('integration_settings')
    .select('provider,enabled,environment,token_last4,api_base_url,webhook_secret,default_billing_type,status,notes,updated_at')
    .eq('law_firm_id', profile.law_firm_id);

  const zapsign = (rows || []).find((r: any) => r.provider === 'zapsign');
  const asaas = (rows || []).find((r: any) => r.provider === 'asaas');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.vercel.app';
  const zapStatus = integrationStatus(zapsign);
  const asaasStatus = integrationStatus(asaas);
  const msg = asaasMessage(query?.asaas);

  return (
    <div>
      <PageHeader title="Integrações" subtitle="Conecte assinatura digital e cobrança sem expor as chaves na interface." />

      {msg && <section className={`card mb-6 border p-4 text-sm font-bold ${msg.cls}`}>{msg.text}</section>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label">Assinatura digital</p>
              <h2 className="mt-2 text-2xl font-black">ZapSign</h2>
              <p className="mt-2 text-sm text-slate-600">Use para enviar procurações, contratos de honorários, acordos e documentos para assinatura.</p>
            </div>
            <span className={`badge ${zapStatus.cls}`}>{zapStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="provider" value="zapsign" />
            <div className="grid gap-4 md:grid-cols-2">
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
              <input name="api_base_url" className="input mt-1" defaultValue={zapsign?.api_base_url || 'https://api.zapsign.com.br/api/v1'} />
            </div>

            <div>
              <label className="label">Webhook no ZapSign</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/zapsign`} />
            </div>

            <button className="btn btn-primary">Salvar ZapSign</button>
          </form>
        </section>

        <section className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label">Cobranças</p>
              <h2 className="mt-2 text-2xl font-black">Asaas</h2>
              <p className="mt-2 text-sm text-slate-600">Gere cobranças de honorários, parcelas, Pix e boleto a partir da pasta do cliente ou do financeiro.</p>
            </div>
            <span className={`badge ${asaasStatus.cls}`}>{asaasStatus.label}</span>
          </div>

          <form action="/api/integrations" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="provider" value="asaas" />
            <div className="grid gap-4 md:grid-cols-2">
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
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter a chave atual. A API Key é enviada ao Asaas pelo backend, nunca pelo navegador.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Tipo de cobrança padrão</label>
                <select name="default_billing_type" defaultValue={asaas?.default_billing_type || 'BOLETO'} className="input mt-1">
                  <option value="BOLETO">Boleto</option>
                  <option value="PIX">Pix</option>
                  <option value="UNDEFINED">Cliente escolhe</option>
                </select>
              </div>
              <div>
                <label className="label">Base URL</label>
                <input name="api_base_url" className="input mt-1" defaultValue={asaas?.api_base_url || 'https://api-sandbox.asaas.com/v3'} />
              </div>
            </div>

            <div>
              <label className="label">Token de segurança do webhook</label>
              <input name="webhook_secret" className="input mt-1" defaultValue={asaas?.webhook_secret || ''} placeholder="Crie uma senha/token para validar os eventos do Asaas" />
              <p className="mt-2 text-xs text-slate-500">Este token será validado pelo AdvOS no header asaas-access-token.</p>
            </div>

            <div>
              <label className="label">Webhook no Asaas</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/asaas`} />
            </div>

            {asaas?.notes && <p className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-xs text-slate-600"><b>Último retorno:</b> {asaas.notes}</p>}

            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary">Salvar Asaas</button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-3">
            <form action="/api/asaas/test" method="post">
              <button className="btn btn-secondary">Testar conexão</button>
            </form>
            <form action="/api/asaas/create-webhook" method="post">
              <button className="btn btn-secondary">Criar webhook no Asaas</button>
            </form>
          </div>

          <div className="mt-5 rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-xs text-slate-600">
            <b>Fluxo:</b> ao gerar contrato dentro da pasta do cliente, o AdvOS cria o cliente no Asaas se necessário, gera entrada/parcelas, salva os links de pagamento e permite enviar tudo pelo WhatsApp.
          </div>
        </section>
      </div>
    </div>
  );
}
