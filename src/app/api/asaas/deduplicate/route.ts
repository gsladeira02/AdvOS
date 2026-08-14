import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  name: string | null;
  doc: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
  asaas_customer_id: string | null;
  created_at?: string | null;
};

type InstallmentRow = {
  id: string;
  contract_id: string | null;
  external_id: string | null;
  import_key: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
};

function onlyNumbers(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function norm(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function redirect(req: Request, params: Record<string, string | number>) {
  const url = new URL('/app/integracoes/asaas/importar', req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return NextResponse.redirect(url, 303);
}

function newestFirst(a: InstallmentRow, b: InstallmentRow) {
  const ad = Date.parse(a.updated_at || a.created_at || '') || 0;
  const bd = Date.parse(b.updated_at || b.created_at || '') || 0;
  return bd - ad;
}

function preferredClient(a: ClientRow, b: ClientRow) {
  const importedA = norm(a.notes).includes('importado do asaas');
  const importedB = norm(b.notes).includes('importado do asaas');
  if (importedA !== importedB) return importedA ? b : a;
  const score = (c: ClientRow) => [c.asaas_customer_id, c.doc, c.email, c.phone, c.whatsapp, c.name].filter(Boolean).length;
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa > sb ? a : b;
  return (Date.parse(a.created_at || '') || 0) <= (Date.parse(b.created_at || '') || 0) ? a : b;
}

async function loadAllAsaasInstallments(admin: any, lawFirmId: string) {
  const rows: InstallmentRow[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await admin
      .from('financial_installments')
      .select('id,contract_id,external_id,import_key,status,updated_at,created_at')
      .eq('law_firm_id', lawFirmId)
      .eq('provider', 'asaas')
      .order('created_at', { ascending: true })
      .range(from, from + chunk - 1);
    if (error) throw error;
    rows.push(...((data || []) as InstallmentRow[]));
    if (!data || data.length < chunk) break;
  }
  return rows;
}

async function loadAllClients(admin: any, lawFirmId: string) {
  const rows: ClientRow[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await admin
      .from('clients')
      .select('id,name,doc,email,phone,whatsapp,notes,asaas_customer_id,created_at')
      .eq('law_firm_id', lawFirmId)
      .order('created_at', { ascending: true })
      .range(from, from + chunk - 1);
    if (error) throw error;
    rows.push(...((data || []) as ClientRow[]));
    if (!data || data.length < chunk) break;
  }
  return rows;
}

async function updateClientReferences(admin: any, lawFirmId: string, fromId: string, toId: string) {
  // Conversas podem ter restrição única por telefone+cliente. Para não causar
  // conflito, um cliente com conversa vinculada não é mesclado automaticamente.
  const { count: conversations } = await admin
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('law_firm_id', lawFirmId)
    .eq('client_id', fromId);
  if ((conversations || 0) > 0) return false;

  const directTables = ['cases', 'deadlines', 'calendar_events', 'documents', 'financial_contracts', 'tasks', 'generated_contracts', 'whatsapp_messages'];
  for (const table of directTables) {
    const { error } = await admin.from(table).update({ client_id: toId }).eq('law_firm_id', lawFirmId).eq('client_id', fromId);
    // Alguns bancos antigos podem não ter todas as tabelas/migrações. Só
    // ignoramos tabela ausente; outros erros interrompem a mesclagem.
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
  }

  const { error: leadsError } = await admin
    .from('whatsapp_leads')
    .update({ converted_client_id: toId })
    .eq('law_firm_id', lawFirmId)
    .eq('converted_client_id', fromId);
  if (leadsError && leadsError.code !== '42P01' && leadsError.code !== 'PGRST205' && leadsError.code !== '42703') throw leadsError;
  return true;
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  const lawFirmId = profile.law_firm_id;

  let removedPayments = 0;
  let removedContracts = 0;
  let mergedClients = 0;
  let skippedClients = 0;

  try {
    // 1) Cobranças Asaas: external_id e import_key são identificadores fortes.
    // Mantemos o registro mais recentemente atualizado e apagamos as repetições.
    const installments = await loadAllAsaasInstallments(admin, lawFirmId);

    const groups = new Map<string, InstallmentRow[]>();
    for (const row of installments) {
      const key = row.external_id ? `external:${row.external_id}` : row.import_key ? `import:${row.import_key}` : '';
      if (!key) continue;
      const bucket = groups.get(key) || [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    const orphanCandidates = new Set<string>();
    for (const bucket of Array.from(groups.values())) {
      if (bucket.length < 2) continue;
      const ordered = [...bucket].sort(newestFirst);
      const keep = ordered[0];
      const duplicates = ordered.slice(1);
      const duplicateIds = duplicates.map(row => row.id);
      duplicates.forEach(row => { if (row.contract_id && row.contract_id !== keep.contract_id) orphanCandidates.add(row.contract_id); });
      const { error } = await admin.from('financial_installments').delete().eq('law_firm_id', lawFirmId).in('id', duplicateIds);
      if (error) throw error;
      removedPayments += duplicateIds.length;
    }

    // Apaga somente contratos candidatos criados para duplicatas e que ficaram
    // sem parcela. Contratos com qualquer parcela restante são preservados.
    for (const contractId of Array.from(orphanCandidates)) {
      const { count, error: countError } = await admin
        .from('financial_installments')
        .select('id', { count: 'exact', head: true })
        .eq('law_firm_id', lawFirmId)
        .eq('contract_id', contractId);
      if (countError) throw countError;
      if ((count || 0) === 0) {
        const { error } = await admin.from('financial_contracts').delete().eq('law_firm_id', lawFirmId).eq('id', contractId);
        if (error) throw error;
        removedContracts++;
      }
    }

    // 2) Clientes: mescla somente duplicidades com identidade forte (mesmo ID
    // Asaas ou mesmo CPF/CNPJ). E-mail/telefone/nome não bastam para apagar.
    const clients = await loadAllClients(admin, lawFirmId);

    const parent = new Map<string, string>();
    for (const c of clients) parent.set(c.id, c.id);
    const find = (id: string): string => {
      const p = parent.get(id) || id;
      if (p === id) return id;
      const root = find(p);
      parent.set(id, root);
      return root;
    };
    const union = (a: string, b: string) => {
      const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra);
    };
    const strongKeys = new Map<string, string>();
    for (const c of clients) {
      const asaasId = String(c.asaas_customer_id || '').trim();
      const doc = onlyNumbers(c.doc);
      const keys = [asaasId ? `asaas:${asaasId}` : '', doc.length >= 11 ? `doc:${doc}` : ''].filter(Boolean);
      for (const key of keys) {
        const previous = strongKeys.get(key);
        if (previous) union(previous, c.id); else strongKeys.set(key, c.id);
      }
    }

    const clientGroups = new Map<string, ClientRow[]>();
    for (const c of clients) {
      const root = find(c.id);
      const bucket = clientGroups.get(root) || [];
      bucket.push(c);
      clientGroups.set(root, bucket);
    }

    for (const group of Array.from(clientGroups.values())) {
      if (group.length < 2) continue;
      let keep = group[0];
      for (const candidate of group.slice(1)) keep = preferredClient(keep, candidate);
      for (const duplicate of group) {
        if (duplicate.id === keep.id) continue;
        const moved = await updateClientReferences(admin, lawFirmId, duplicate.id, keep.id);
        if (!moved) { skippedClients++; continue; }

        const updates: Record<string, any> = {};
        for (const field of ['doc','email','phone','whatsapp','asaas_customer_id'] as const) {
          if (!(keep as any)[field] && (duplicate as any)[field]) updates[field] = (duplicate as any)[field];
        }
        if (Object.keys(updates).length) {
          const { error } = await admin.from('clients').update(updates).eq('law_firm_id', lawFirmId).eq('id', keep.id);
          if (error) throw error;
          Object.assign(keep, updates);
        }
        const { error } = await admin.from('clients').delete().eq('law_firm_id', lawFirmId).eq('id', duplicate.id);
        if (error) throw error;
        mergedClients++;
      }
    }

    await admin.from('activity_logs').insert({
      law_firm_id: lawFirmId,
      auth_user_id: session.user.id,
      action: 'limpou_duplicacoes_asaas',
      entity: 'financial_installments',
    });

    return redirect(req, {
      limpeza: 1,
      cobrancas_removidas: removedPayments,
      contratos_removidos: removedContracts,
      clientes_mesclados: mergedClients,
      clientes_ignorados: skippedClients,
    });
  } catch (error: any) {
    return redirect(req, { erro_limpeza: error?.message || 'Não foi possível limpar as duplicações.' });
  }
}
