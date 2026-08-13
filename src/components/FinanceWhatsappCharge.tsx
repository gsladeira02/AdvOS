'use client';

import { useMemo, useState } from 'react';
import { renderMessageTemplate } from '@/lib/messageTemplates';
import { whatsappShareUrl, whatsappUrl } from '@/lib/whatsapp';
import Link from 'next/link';

export type ChargeTemplateOption = {
  id: string;
  name: string;
  body: string;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
};

function templateVariableValues(body: string, values: Record<string, string>) {
  const seen: string[] = [];
  const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let match = regex.exec(String(body || ''));
  while (match) {
    const key = String(match[1] || '').trim();
    if (key && !seen.includes(key)) seen.push(key);
    match = regex.exec(String(body || ''));
  }
  return seen.map((key) => values[key] || '');
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M16 3.5A12.4 12.4 0 0 0 5.4 22.3L4 28.5l6.3-1.5A12.4 12.4 0 1 0 16 3.5Zm0 22.6c-2 0-3.8-.6-5.4-1.6l-.4-.2-3.4.8.8-3.3-.3-.4A10.2 10.2 0 1 1 16 26.1Zm5.7-7.6c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.3 1.4 3.6c.2.2 2.4 3.7 5.8 5.1.8.3 1.5.5 2 .7.8.3 1.6.2 2.2.1.7-.1 1.8-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
    </svg>
  );
}

export function FinanceWhatsappCharge(props: {
  disabled?: boolean;
  paid?: boolean;
  clientId?: string | null;
  clientName?: string | null;
  phone?: string | null;
  installmentLabel: string;
  amount: number;
  dueDate?: string | null;
  asaasUrl?: string | null;
  firmName?: string | null;
  firmPhone?: string | null;
  userName?: string | null;
  templates: ChargeTemplateOption[];
}) {
  const templates = props.templates || [];
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedId) || templates[0];
  }, [selectedId, templates]);

  const contextValues = useMemo(() => {
    const formattedValue = Number(props.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dueDate = props.dueDate ? new Date(`${props.dueDate}T12:00:00`).toLocaleDateString('pt-BR') : '';
    const firstName = String(props.clientName || '').trim().split(/\s+/)[0] || '';
    return {
      cliente: props.clientName || '',
      primeiro_nome: firstName,
      parcela: props.installmentLabel,
      valor: formattedValue,
      vencimento: dueDate,
      vencimento_iso: props.dueDate || '',
      link_asaas: props.asaasUrl || '',
      escritorio: props.firmName || 'escritório',
      telefone_escritorio: props.firmPhone || '',
      usuario: props.userName || '',
      usuario_nome_completo: props.userName || '',
    };
  }, [props.clientName, props.installmentLabel, props.amount, props.dueDate, props.asaasUrl, props.firmName, props.firmPhone, props.userName]);

  const message = useMemo(() => {
    if (!selectedTemplate?.body) return '';
    return renderMessageTemplate(selectedTemplate.body, contextValues);
  }, [selectedTemplate, contextValues]);

  const metaTemplateName = String(selectedTemplate?.meta_template_name || '').trim();
  const metaTemplateLanguage = String(selectedTemplate?.meta_template_language || 'pt_BR').trim() || 'pt_BR';
  const templateParameters = useMemo(() => templateVariableValues(selectedTemplate?.body || '', contextValues), [selectedTemplate, contextValues]);

  const whatsappHref = props.phone ? whatsappUrl(props.phone, message) : whatsappShareUrl(message);

  const conversationHref = useMemo(() => {
    const params = new URLSearchParams();
    if (props.clientId) params.set('cliente', props.clientId);
    if (message) params.set('draft', message);
    return `/app/whatsapp?${params.toString()}`;
  }, [props.clientId, message]);

  function explainConversationDraft() {
    setFeedback('A conversa será aberta com a mensagem pronta. O envio acontece pela central do WhatsApp.');
  }


  async function sendOfficialTemplate() {
    if (!metaTemplateName) {
      setFeedback('Este modelo ainda não tem nome de template oficial da Meta. Cadastre em Modelos de mensagem → Template Meta.');
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: props.phone,
          client_id: props.clientId,
          message,
          mode: 'template',
          template_name: metaTemplateName,
          template_language: metaTemplateLanguage,
          template_parameters: templateParameters,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar o template oficial.');
      setFeedback('Template oficial enviado pela API. Confira a entrega na aba WhatsApp.');
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar template oficial pela Meta.');
    } finally {
      setSending(false);
    }
  }

  if (props.paid) {
    return (
      <button className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-slate-200 text-slate-400 opacity-70" disabled title="Cobrança paga" type="button">
        <WhatsAppIcon />
      </button>
    );
  }

  if (props.disabled || !templates.length) {
    return (
      <button className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-slate-200 text-slate-400 opacity-70" disabled title="Nenhum modelo de cobrança disponível" type="button">
        <WhatsAppIcon />
      </button>
    );
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:scale-105 hover:bg-[#1ebe5d]"
        onClick={() => setOpen((value) => !value)}
        title="Cobrar pelo WhatsApp"
        aria-label="Cobrar pelo WhatsApp"
      >
        <WhatsAppIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Cobrança pelo WhatsApp">
          <button type="button" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" aria-label="Fechar cobrança" onClick={() => setOpen(false)} />
          <div className="relative z-10 max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-4 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Cobrança por WhatsApp</p>
                <h3 className="mt-1 break-safe text-sm font-black text-slate-950">{props.clientName || 'Cliente'}</h3>
              </div>
              <button type="button" className="btn btn-ghost !min-h-0 !rounded-lg !px-2.5 !py-1.5 text-xs" onClick={() => setOpen(false)}>Fechar</button>
            </div>

            <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-slate-500">Modelo de cobrança</label>
            <select className="input mt-2 !rounded-lg !px-3 !py-2 text-xs" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>

            <div className="break-safe mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-[#eee4d4] bg-white p-3 text-[11px] leading-relaxed text-slate-600">
              {message || 'Selecione um modelo para visualizar a mensagem.'}
            </div>

            {!props.phone && (
              <p className="break-safe mt-2 text-[11px] font-bold text-amber-700">
                Cliente sem WhatsApp ou telefone cadastrado. O envio pela integração exige um número válido.
              </p>
            )}

            {feedback && <p className="break-safe mt-2 rounded-lg border border-[#eee4d4] bg-white p-2 text-[11px] font-bold text-slate-700">{feedback}</p>}

            <div className="break-safe mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
              <b>Envio fora da janela de atendimento:</b> a Meta pode exigir um modelo oficial aprovado.
              {metaTemplateName ? <span> Este modelo está vinculado ao template <b>{metaTemplateName}</b>.</span> : <span> Configure o campo <b>Template Meta</b> em Modelos de mensagem quando necessário.</span>}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {props.clientId && props.phone ? (
                <Link href={conversationHref} className="btn btn-primary !rounded-lg !px-3 !py-2 text-xs" onClick={explainConversationDraft}>
                  Abrir conversa
                </Link>
              ) : (
                <button type="button" className="btn btn-primary !rounded-lg !px-3 !py-2 text-xs" disabled>
                  Cliente sem conversa
                </button>
              )}
              {metaTemplateName && (
                <button type="button" className="btn btn-secondary !rounded-lg !px-3 !py-2 text-xs" onClick={sendOfficialTemplate} disabled={sending || !props.phone}>
                  Enviar modelo oficial
                </button>
              )}
              <a href={whatsappHref} target="_blank" rel="noreferrer" className={`btn btn-secondary !rounded-lg !px-3 !py-2 text-xs ${metaTemplateName ? 'sm:col-span-2' : ''}`}>
                Abrir no WhatsApp Web
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
