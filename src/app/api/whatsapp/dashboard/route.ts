import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadWhatsappDashboard } from '@/lib/whatsappDashboard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const dashboard = await loadWhatsappDashboard(admin, profile.law_firm_id);
    return NextResponse.json({ ok: true, dashboard }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Erro ao carregar dashboard do WhatsApp.' }, { status: 400 });
  }
}
