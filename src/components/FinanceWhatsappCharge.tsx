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
        <div className="mt-2 w-[360px] max-w-[78vw] rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 text-left shadow-lg">
          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Modelo de cobrança</label>
          <select className="input mt-2 !rounded-lg !px-3 !py-2 text-xs" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>

          <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-[#eee4d4] bg-white p-3 text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap">
            {message || 'Selecione um modelo para visualizar a mensagem.'}
          </div>

          {!props.phone && (
            <p className="mt-2 text-[11px] font-bold text-amber-700">
              Cliente sem WhatsApp/telefone. O envio pela API exige telefone; o WhatsApp Web abrirá sem destinatário.
            </p>
          )}

          {feedback && <p className="mt-2 rounded-lg border border-[#eee4d4] bg-white p-2 text-[11px] font-bold text-slate-700">{feedback}</p>}

          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
            <b>Regra da Meta:</b> o botão principal agora abre a conversa com o texto pronto. Se a janela de 24h estiver fechada, envie um template oficial aprovado.
            {metaTemplateName ? <span> Este modelo está ligado ao template Meta <b>{metaTemplateName}</b>.</span> : <span> Cadastre o campo <b>Template Meta</b> em Modelos de mensagem para cobranças fora da janela.</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.clientId && props.phone ? (
              <Link href={conversationHref} className="btn btn-primary !rounded-lg !px-3 !py-2 text-xs" onClick={explainConversationDraft}>
                Abrir conversa com texto
              </Link>
            ) : (
              <button type="button" className="btn btn-primary !rounded-lg !px-3 !py-2 text-xs" disabled>
                Cliente sem conversa
              </button>
            )}
            {metaTemplateName && (
              <button type="button" className="btn btn-secondary !rounded-lg !px-3 !py-2 text-xs" onClick={sendOfficialTemplate} disabled={sending || !props.phone}>
                Template oficial
              </button>
            )}

            <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn btn-secondary !rounded-lg !px-3 !py-2 text-xs">
              Abrir Web
            </a>
            <button type="button" className="btn btn-ghost !rounded-lg !px-3 !py-2 text-xs" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
