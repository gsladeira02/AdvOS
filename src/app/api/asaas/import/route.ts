import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { assertContentLength, SecurityError } from '@/lib/security';
import { paymentMethodFromBillingType } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 50_000;
const ALLOWED_IMPORT_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

type ExistingClient = {
  id: string;
  name: string | null;
  doc: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  asaas_customer_id: string | null;
  service_id?: string | null;
};

type ImportStats = {
  insertedClients: number;
  updatedClients: number;
  insertedPayments: number;
  updatedPayments: number;
  skippedRows: number;
  errors: string[];
};

function str(v: any) {
  return String(v ?? '').trim();
}

function cleanNullable(v: any) {
  const value = str(v);
  return value || null;
}

function normalizeKey(v: string) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function onlyNumbers(v?: string | null) {
  return String(v || '').replace(/\D/g, '');
}

function normalizeText(v?: string | null) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rowMap(row: Record<string, any>) {
  const m = new Map<string, any>();
  for (const [key, value] of Object.entries(row || {})) {
    m.set(normalizeKey(key), value);
  }
  return m;
}

function pick(map: Map<string, any>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = map.get(normalizeKey(candidate));
    if (value !== undefined && str(value) !== '') return str(value);
  }
  return '';
}

function parseMoney(v: any) {
  if (typeof v === 'number') return v;
  let s = str(v);
  if (!s) return 0;
  s = s.replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function excelDateToISO(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

function parseDate(v: any) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelDateToISO(v);
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function mapStatus(status: string) {
  const s = normalizeText(status);
  if (!s) return 'pendente';
  if (['recebido', 'recebida', 'pago', 'paga', 'confirmado', 'confirmada', 'received', 'confirmed', 'receivedincash'].some(x => s.includes(x))) return 'pago';
  if (['vencido', 'vencida', 'atrasado', 'atrasada', 'overdue'].some(x => s.includes(x))) return 'atrasado';
  if (['cancelado', 'cancelada', 'canceled', 'deleted'].some(x => s.includes(x))) return 'cancelado';
  return 'pendente';
}

function mapBillingType(v: string) {
  const s = normalizeText(v).replace(/\s/g, '');
  if (!s) return null;
  if (s.includes('pix')) return 'PIX';
  if (s.includes('boleto')) return 'BOLETO';
  if (s.includes('cartao') || s.includes('creditcard')) return 'CREDIT_CARD';
  if (s.includes('undefined') || s.includes('clienteescolhe')) return 'UNDEFINED';
  return v.toUpperCase();
}

const FIELD = {
  clientName: ['nome do cliente', 'nome cliente', 'cliente', 'nome', 'customer name', 'name', 'pagador', 'nome pagador', 'sacado'],
  clientDoc: ['cpf/cnpj', 'cpf cnpj', 'cpfcnpj', 'cpf', 'cnpj', 'documento', 'cpf ou cnpj', 'document', 'cpfCnpj'],
  clientEmail: ['email', 'e-mail', 'email cliente', 'customer email'],
  clientPhone: ['telefone', 'celular', 'whatsapp', 'fone', 'mobile phone', 'mobilePhone', 'phone', 'telefone cliente'],
  asaasCustomerId: ['id cliente', 'id do cliente', 'customer id', 'customer', 'cliente id', 'id asaas cliente', 'asaas customer id'],
  paymentId: ['id cobrança', 'id cobranca', 'id da cobrança', 'id da cobranca', 'id pagamento', 'payment id', 'id payment', 'cobrança', 'cobranca'],
  genericId: ['id'],
  paymentValue: ['valor', 'valor da cobrança', 'valor da cobranca', 'value', 'valor original', 'amount', 'total'],
  dueDate: ['vencimento', 'data de vencimento', 'data vencimento', 'due date', 'duedate'],
  paidAt: ['data de pagamento', 'data pagamento', 'data recebimento', 'pagamento', 'payment date', 'paymentdate', 'received date'],
  status: ['status', 'situação', 'situacao', 'estado'],
  billingType: ['forma de pagamento', 'tipo de cobrança', 'tipo de cobranca', 'billing type', 'billingtype', 'payment type'],
  description: ['descrição', 'descricao', 'description', 'serviço', 'servico', 'observação', 'observacao', 'referência', 'referencia'],
  paymentUrl: ['link', 'link pagamento', 'link de pagamento', 'link da fatura', 'invoice url', 'invoiceurl', 'payment link', 'paymentlink', 'url'],
  externalReference: ['referência externa', 'referencia externa', 'external reference', 'externalreference'],
};

function readRows(fileName: string, buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
}

function findClient(existing: ExistingClient[], data: { asaasCustomerId?: string; doc?: string; email?: string; phone?: string; name?: string }) {
  const asaasId = str(data.asaasCustomerId);
  const doc = onlyNumbers(data.doc);
  const email = normalizeText(data.email);
  const phone = onlyNumbers(data.phone);
  const name = normalizeText(data.name);

  return existing.find(c => asaasId && c.asaas_customer_id === asaasId)
    || existing.find(c => doc && onlyNumbers(c.doc) === doc)
    || existing.find(c => email && normalizeText(c.email) === email)
    || existing.find(c => phone && (onlyNumbers(c.whatsapp) === phone || onlyNumbers(c.phone) === phone))
    || existing.find(c => name && normalizeText(c.name) === name)
    || null;
}

function buildClientPayload(lawFirmId: string, data: any, defaultServiceId: string | null) {
  return {
    law_firm_id: lawFirmId,
    name: data.name,
    doc: cleanNullable(data.doc),
    client_type: onlyNumbers(data.doc).length > 11 ? 'pessoa jurídica' : 'pessoa física',
    phone: cleanNullable(data.phone),
    whatsapp: cleanNullable(data.phone),
    email: cleanNullable(data.email),
    address: cleanNullable(data.address),
    notes: 'Importado do Asaas',
    asaas_customer_id: cleanNullable(data.asaasCustomerId),
    service_id: defaultServiceId,
  };
}

function safeRedirect(req: Request, params: Record<string, string | number>) {
  const url = new URL('/app/integracoes/asaas/importar', req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return NextResponse.redirect(url, 303);
}

async function loadAllClients(admin: ReturnType<typeof createAdminSupabase>, lawFirmId: string) {
  const result: ExistingClient[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const { data, error } = await admin
      .from('clients')
      .select('id,name,doc,email,phone,whatsapp,asaas_customer_id,service_id')
      .eq('law_firm_id', lawFirmId)
      .order('id', { ascending: true })
      .range(from, from + chunk - 1);
    if (error) throw error;
    result.push(...((data || []) as ExistingClient[]));
    if (!data || data.length < chunk) break;
  }
  return result;
}

export async function POST(req: Request) {
  const { session, profile } = await getCurrentAdminProfile();
  const admin = createAdminSupabase();
  try {
    assertContentLength(req, 12 * 1024 * 1024);
  } catch (error: any) {
    const message = error instanceof SecurityError ? error.message : 'Arquivo muito grande.';
    return safeRedirect(req, { erro: message });
  }
  const form = await req.formData();
  const file = form.get('file');
  const importType = str(form.get('import_type')) || 'auto';
  const defaultServiceId = str(form.get('service_id')) || null;
  const createMissingClients = str(form.get('create_missing_clients')) === 'true';
  const updateExistingClients = str(form.get('update_existing_clients')) === 'true';

  if (!(file instanceof File)) {
    return safeRedirect(req, { erro: 'Arquivo não enviado.' });
  }

  const fileName = file.name || 'importacao-asaas.xlsx';
  if (!ALLOWED_IMPORT_EXTENSIONS.test(fileName)) {
    return safeRedirect(req, { erro: 'Formato não permitido. Envie XLSX, XLS ou CSV.' });
  }
  if (!file.size || file.size > MAX_IMPORT_FILE_SIZE) {
    return safeRedirect(req, { erro: 'A planilha deve ter no máximo 10 MB.' });
  }
  const stats: ImportStats = { insertedClients: 0, updatedClients: 0, insertedPayments: 0, updatedPayments: 0, skippedRows: 0, errors: [] };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = readRows(fileName, buffer);
    if (rows.length > MAX_IMPORT_ROWS) return safeRedirect(req, { erro: `A planilha excede o limite de ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')} linhas.` });
    if (!rows.length) return safeRedirect(req, { erro: 'Nenhuma linha encontrada no arquivo.' });

    // O Supabase costuma limitar respostas a 1.000 linhas. Carregar em páginas
    // evita que escritórios maiores criem um cliente duplicado só porque o
    // cadastro original ficou fora da primeira página da consulta.
    const existingClients = await loadAllClients(admin, profile.law_firm_id);

    let batchId: string | null = null;
    const batchInsert = await admin.from('asaas_import_batches').insert({
      law_firm_id: profile.law_firm_id,
      file_name: fileName,
      import_type: importType,
      inserted_clients: 0,
      updated_clients: 0,
      inserted_payments: 0,
      updated_payments: 0,
      skipped_rows: 0,
      errors: [],
    }).select('id').single();
    if (!batchInsert.error) batchId = batchInsert.data.id;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const map = rowMap(row);
      const name = pick(map, FIELD.clientName);
      const doc = pick(map, FIELD.clientDoc);
      const email = pick(map, FIELD.clientEmail);
      const phone = pick(map, FIELD.clientPhone);
      const asaasCustomerId = pick(map, FIELD.asaasCustomerId);
      const paymentValue = parseMoney(pick(map, FIELD.paymentValue));
      const dueDate = parseDate(pick(map, FIELD.dueDate));
      const status = mapStatus(pick(map, FIELD.status));
      const paidAt = parseDate(pick(map, FIELD.paidAt));
      const description = pick(map, FIELD.description) || 'Cobrança importada do Asaas';
      const paymentUrl = pick(map, FIELD.paymentUrl);
      const billingType = mapBillingType(pick(map, FIELD.billingType));
      const externalReference = pick(map, FIELD.externalReference);
      const paymentIdCandidate = pick(map, FIELD.paymentId);
      const genericId = pick(map, FIELD.genericId);
      const paymentId = paymentIdCandidate || (paymentValue || dueDate ? genericId : '');
      const shouldImportPayment = importType !== 'clients' && Boolean(paymentValue || dueDate || paymentId || paymentUrl);
      const shouldImportClient = importType !== 'payments' || shouldImportPayment;

      try {
        if (!name && !doc && !email && !phone && !paymentValue && !dueDate && !paymentId) {
          stats.skippedRows++;
          continue;
        }

        let client = findClient(existingClients, { asaasCustomerId, doc, email, phone, name });

        if (shouldImportClient && name) {
          if (!client && createMissingClients) {
            const payload = buildClientPayload(profile.law_firm_id, { name, doc, email, phone, asaasCustomerId }, defaultServiceId);
            const { data: created, error } = await admin.from('clients').insert(payload).select('id,name,doc,email,phone,whatsapp,asaas_customer_id,service_id').single();
            if (error) throw error;
            client = created as any;
            existingClients.push(client);
            stats.insertedClients++;
          } else if (client && updateExistingClients) {
            const updates: any = {};
            if (!client.doc && doc) updates.doc = doc;
            if (!client.email && email) updates.email = email;
            if (!client.phone && phone) updates.phone = phone;
            if (!client.whatsapp && phone) updates.whatsapp = phone;
            if (!client.asaas_customer_id && asaasCustomerId) updates.asaas_customer_id = asaasCustomerId;
            if (!client.service_id && defaultServiceId) updates.service_id = defaultServiceId;
            if (Object.keys(updates).length) {
              const { error } = await admin.from('clients').update(updates).eq('id', client.id).eq('law_firm_id', profile.law_firm_id);
              if (error) throw error;
              Object.assign(client, updates);
              stats.updatedClients++;
            }
          }
        }

        if (!shouldImportPayment) continue;
        if (!client) {
          stats.skippedRows++;
          stats.errors.push(`Linha ${idx + 2}: cobrança ignorada porque nenhum cliente foi encontrado/criado.`);
          continue;
        }

        if (!paymentValue && !dueDate && !paymentId) {
          stats.skippedRows++;
          continue;
        }

        const contractDescription = description || `Cobrança Asaas - ${client.name}`;
        // A chave de importação precisa existir ANTES da consulta. Nas versões
        // anteriores ela era salva, mas não era usada para procurar uma cobrança
        // já importada quando o arquivo não trazia um external_id reconhecível.
        // Isso fazia a mesma planilha criar novas cobranças em uma reimportação.
        const importKey = paymentId || `${client.id}:${dueDate || 'sem-data'}:${paymentValue}:${normalizeText(contractDescription)}`;

        let existingInstallment: any = null;
        if (paymentId) {
          const { data } = await admin
            .from('financial_installments')
            .select('id,contract_id')
            .eq('law_firm_id', profile.law_firm_id)
            .eq('provider', 'asaas')
            .eq('external_id', paymentId)
            .limit(1)
            .maybeSingle();
          existingInstallment = data;
        }
        if (!existingInstallment && importKey) {
          const { data } = await admin
            .from('financial_installments')
            .select('id,contract_id')
            .eq('law_firm_id', profile.law_firm_id)
            .eq('provider', 'asaas')
            .eq('import_key', importKey)
            .limit(1)
            .maybeSingle();
          existingInstallment = data;
        }

        if (existingInstallment) {
          const { error } = await admin.from('financial_installments').update({
            amount: paymentValue || 0,
            due_date: dueDate,
            paid_at: paidAt,
            status,
            provider: 'asaas',
            payment_url: paymentUrl || null,
            invoice_url: paymentUrl || null,
            billing_type: billingType,
            payment_method: paymentMethodFromBillingType(billingType),
            integration_status: 'importada',
            import_source: 'asaas_arquivo',
            import_batch_id: batchId,
            raw_payload: row,
            updated_at: new Date().toISOString(),
          }).eq('id', existingInstallment.id).eq('law_firm_id', profile.law_firm_id);
          if (error) throw error;
          stats.updatedPayments++;
        } else {
          const { data: contract, error: contractError } = await admin.from('financial_contracts').insert({
            law_firm_id: profile.law_firm_id,
            client_id: client.id,
            description: contractDescription,
            total_amount: paymentValue || 0,
            status: status === 'pago' ? 'quitado' : 'ativo',
          }).select('id').single();
          if (contractError) throw contractError;

          const { error: installmentError } = await admin.from('financial_installments').insert({
            law_firm_id: profile.law_firm_id,
            contract_id: contract.id,
            amount: paymentValue || 0,
            due_date: dueDate,
            paid_at: paidAt,
            status,
            provider: 'asaas',
            external_id: paymentId || null,
            payment_url: paymentUrl || null,
            invoice_url: paymentUrl || null,
            billing_type: billingType,
            payment_method: paymentMethodFromBillingType(billingType),
            integration_status: 'importada',
            import_source: 'asaas_arquivo',
            import_key: importKey,
            import_batch_id: batchId,
            raw_payload: row,
          });
          if (installmentError) {
            // Com os índices únicos da v9.53, duas importações simultâneas podem
            // disputar a mesma cobrança. Nesse caso, removemos o contrato que
            // acabou de ser criado e tratamos a linha como já existente.
            if (installmentError.code === '23505') {
              await admin.from('financial_contracts').delete().eq('id', contract.id).eq('law_firm_id', profile.law_firm_id);
              stats.updatedPayments++;
            } else {
              throw installmentError;
            }
          } else {
            stats.insertedPayments++;
          }
        }
      } catch (error: any) {
        stats.skippedRows++;
        stats.errors.push(`Linha ${idx + 2}: ${error?.message || 'erro desconhecido'}`);
      }
    }

    if (batchId) {
      await admin.from('asaas_import_batches').update({
        inserted_clients: stats.insertedClients,
        updated_clients: stats.updatedClients,
        inserted_payments: stats.insertedPayments,
        updated_payments: stats.updatedPayments,
        skipped_rows: stats.skippedRows,
        errors: stats.errors.slice(0, 50),
      }).eq('id', batchId).eq('law_firm_id', profile.law_firm_id);
    }

    await admin.from('activity_logs').insert({
      law_firm_id: profile.law_firm_id,
      auth_user_id: session.user.id,
      action: 'importou_asaas_inicial',
      entity: 'asaas_import_batches',
      entity_id: batchId,
    });

    return safeRedirect(req, {
      ok: 1,
      clientes_criados: stats.insertedClients,
      clientes_atualizados: stats.updatedClients,
      cobrancas_criadas: stats.insertedPayments,
      cobrancas_atualizadas: stats.updatedPayments,
      ignoradas: stats.skippedRows,
    });
  } catch (error: any) {
    return safeRedirect(req, { erro: error?.message || 'Não foi possível importar o arquivo.' });
  }
}
