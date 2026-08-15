# AdvOS v9.84.5

- Corrige envio do OTP de assinatura do cliente pela API oficial do WhatsApp.
- Se a janela de 24h estiver encerrada e um template de OTP estiver configurado, o AdvOS usa o template oficial automaticamente.
- Template configurável por `raw_settings.signature_otp_template_name` na integração WhatsApp ou `WHATSAPP_SIGNATURE_OTP_TEMPLATE` na Vercel.
- Código OTP continua com validade de 10 minutos e é salvo com hash.
- Nenhuma mudança no fluxo de assinatura do advogado.
