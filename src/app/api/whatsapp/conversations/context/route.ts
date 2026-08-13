import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadWhatsappConversationContext } from '@/lib/whatsappOperations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
  try {
    const { profile } = await getCurrentProfile();
    const admin = createAdminSupabase();
    const conversationId = String(new URL(req.url).searchParams.get('conversationId') || '').trim();
    if (!conversationId) return NextResponse.json({ ok: false, error: 'Conversa inválida.' }, { status: 400 });

    const { data: conversation, error } = await admin
      .from('whatsapp_conversations')
      .select('id')
      .eq('law_firm_id', profile.law_firm_id)
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversation?.id) return NextResponse.json({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });

    const context = await loadWhatsappConversationContext(admin, profile.law_firm_id, conversationId);
    return NextResponse.json({ ok: true, ...context }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Não foi possível carregar notas e histórico.' }, { status: 400 });
  }
}
