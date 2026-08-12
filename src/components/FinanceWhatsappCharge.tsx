'use client';

import { useMemo, useState } from 'react';
import { renderMessageTemplate } from '@/lib/messageTemplates';
import { whatsappShareUrl, whatsappUrl } from '@/lib/whatsapp';

export type ChargeTemplateOption = {
  id: string;
  name: string;
  body: string;
};

export function FinanceWhatsappCharge(props: {
  disabled?: boolean;
  paid?: boolean;
  clientName?: string | null;
  phone?: string | null;
  installmentLabel: string;
  amount: number;
  dueDate?: string | null;
  asaasUrl?: string | null;
  firmName?: string | null;
  firmPhone?: string | null;
  templates: ChargeTemplateOption[];
}) {
  const templates = props.templates || [];
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedId) || templates[0];
  }, [selectedId, templates]);

  const message = useMemo(() => {
    if (!selectedTemplate?.body) return '';

    return renderMessageTemplate(selectedTemplate.body, {
      cliente: props.clientName || '',
      parcela: props.installmentLabel,
      valor: Number(props.amount || 0),
      vencimento_iso: props.dueDate || '',
      link_asaas: props.asaasUrl || '',
      escritorio: props.firmName || 'escritório',
      telefone_escritorio: props.firmPhone || '',
    });
  }, [selectedTemplate, props.clientName, props.installmentLabel, props.amount, props.dueDate, props.asaasUrl, props.firmName, props.firmPhone]);

  const whatsappHref = props.phone ? whatsappUrl(props.phone, message) : whatsappShareUrl(message);

  if (props.paid) {
    return <button className="btn w-full cursor-not-allowed justify-center opacity-50" disabled>Cobrança paga</button>;
  }

  if (props.disabled || !templates.length) {
    return <button className="btn w-full cursor-not-allowed justify-center opacity-50" disabled>Cobrar no WhatsApp</button>;
  }

  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-primary w-full justify-center" onClick={() => setOpen((value) => !value)}>
        Cobrar no WhatsApp
      </button>

      {open && (
        <div className="rounded-2xl border border-[#eee4d4] bg-[#fbf7ef] p-3 shadow-sm">
          <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">Modelo de cobrança</label>
          <select className="input mt-2" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>

          <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-[#eee4d4] bg-white p-3 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
            {message || 'Selecione um modelo para visualizar a mensagem.'}
          </div>

          {!props.phone && (
            <p className="mt-2 text-xs font-bold text-amber-700">
              Cliente sem WhatsApp/telefone. O WhatsApp abrirá sem destinatário para você escolher manualmente.
            </p>
          )}

          <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn btn-primary mt-3 w-full justify-center">
            Abrir WhatsApp com este modelo
          </a>
        </div>
      )}
    </div>
  );
}
