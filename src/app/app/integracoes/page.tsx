export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/PageHeader';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function integrationStatus(row: any) {
  if (!row?.enabled) return { label: 'desativada', cls: 'badge-warn' };
  if (row?.status === 'testado') return { label: 'ativa', cls: 'badge-ok' };
  if (row?.token_last4) return { label: 'configurada', cls: 'badge-info' };
  return { label: 'sem chave', cls: 'badge-danger' };
}

export default async function Integracoes() {
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();
  const { data: rows } = await admin
    .from('integration_settings')
    .select('provider,enabled,environment,token_last4,api_base_url,webhook_secret,default_billing_type,status,updated_at')
    .eq('law_firm_id', profile.law_firm_id);

  const zapsign = (rows || []).find((r: any) => r.provider === 'zapsign');
  const asaas = (rows || []).find((r: any) => r.provider === 'asaas');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seu-dominio.vercel.app';
  const zapStatus = integrationStatus(zapsign);
  const asaasStatus = integrationStatus(asaas);

  return (
    <div>
      <PageHeader title="Integrações" subtitle="Conecte assinatura digital e cobrança sem expor as chaves na interface." />

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
              <p className="mt-2 text-sm text-slate-600">Use para gerar cobranças de honorários, parcelas, Pix e boleto a partir do financeiro.</p>
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
              <label className="label">API Key</label>
              <input name="api_token" type="password" className="input mt-1" placeholder={asaas?.token_last4 ? `Chave salva terminando em ${asaas.token_last4}` : 'Cole a API Key do Asaas'} />
              <p className="mt-2 text-xs text-slate-500">Deixe vazio para manter a chave atual.</p>
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
              <label className="label">Webhook no Asaas</label>
              <input className="input mt-1 bg-slate-50" readOnly value={`${appUrl}/api/webhooks/asaas`} />
            </div>

            <button className="btn btn-primary">Salvar Asaas</button>
          </form>
        </section>
      </div>
    </div>
  );
}
