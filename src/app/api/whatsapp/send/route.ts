import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { sendWhatsAppTemplate, sendWhatsAppText } from '@/lib/whatsappApi';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function str(value: any) {
  return String(value || '').trim();
}

function arrayOfStrings(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim());
}

function isCustomerCareWindowError(message: string) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('24h')
    || normalized.includes('24 hours')
    || normalized.includes('24 horas')
    || normalized.includes('customer last replied')
    || normalized.includes('janela de atendimento');
}

export async function POST(req: Request) {
  try {
    const { session, profile } = await getCurrentProfile();
    const body = await req.json().catch(() => ({}));

    const phone = str(body.phone || body.to);
    const message = str(body.message);
    const clientId = str(body.client_id || body.clientId) || null;
    const templateName = str(body.template_name || body.templateName || body.meta_template_name || body.metaTemplateName);
    const templateLanguage = str(body.template_language || body.templateLanguage || body.meta_template_language || body.metaTemplateLanguage) || 'pt_BR';
    const templateParameters = arrayOfStrings(body.template_parameters || body.templateParameters || body.parameters);
    const forceTemplate = Boolean(body.force_template || body.forceTemplate || body.mode === 'template');

    if (forceTemplate || (templateName && !message)) {
      const result = await sendWhatsAppTemplate({
        lawFirmId: profile.law_firm_id,
        to: phone,
        templateName,
        language: templateLanguage,
        parameters: templateParameters,
        renderedBody: message,
        clientId,
        sentBy: session.user.id,
      });
      return NextResponse.json({ ok: true, sent_as: 'template', ...result });
    }

    try {
      const result = await sendWhatsAppText({
        lawFirmId: profile.law_firm_id,
        to: phone,
        message,
        clientId,
        sentBy: session.user.id,
      });
      return NextResponse.json({ ok: true, sent_as: 'text', ...result });
    } catch (error: any) {
      const textError = error?.message || 'Erro ao enviar WhatsApp.';
      if (templateName && isCustomerCareWindowError(textError)) {
        const result = await sendWhatsAppTemplate({
          lawFirmId: profile.law_firm_id,
          to: phone,
          templateName,
          language: templateLanguage,
          parameters: templateParameters,
          renderedBody: message,
          clientId,
          sentBy: session.user.id,
        });
        return NextResponse.json({ ok: true, sent_as: 'template', fallback_from_text: true, ...result });
      }
      throw error;
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao enviar WhatsApp.' }, { status: 400 });
  }
}
