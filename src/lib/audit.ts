import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

function firstHeader(value: string | null) {
  return String(value || '').split(',')[0]?.trim() || null;
}

export function requestAuditContext(req?: Request | null) {
  if (!req) return { ip: null, userAgent: null };
  return {
    ip: firstHeader(req.headers.get('x-forwarded-for')) || firstHeader(req.headers.get('x-real-ip')),
    userAgent: String(req.headers.get('user-agent') || '').slice(0, 500) || null,
  };
}

export async function recordSecurityEvent(input: {
  lawFirmId?: string | null;
  authUserId?: string | null;
  eventType: string;
  entity?: string | null;
  entityId?: string | null;
  req?: Request | null;
  metadata?: Record<string, unknown> | null;
  severity?: 'info' | 'warning' | 'critical';
}) {
  try {
    const admin = createAdminSupabase();
    const ctx = requestAuditContext(input.req);
    await admin.from('security_events').insert({
      law_firm_id: input.lawFirmId || null,
      auth_user_id: input.authUserId || null,
      event_type: String(input.eventType || '').slice(0, 120),
      entity: input.entity ? String(input.entity).slice(0, 120) : null,
      entity_id: input.entityId || null,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      severity: input.severity || 'info',
      metadata: input.metadata || {},
    });
  } catch (error) {
    // Falha de auditoria não deve derrubar a operação principal, mas deve aparecer
    // nos logs da Vercel para investigação.
    console.error('Falha ao registrar evento de segurança:', error);
  }
}
