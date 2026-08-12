export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { WhatsappThread } from '@/components/WhatsappThread';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

function titleFor(conversation: any) {
  return conversation.clients?.name || conversation.lead_name || conversation.phone || 'Conversa';
}

export default async function WhatsAppCentral({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const { profile } = await getCurrentProfile();
  const admin = createAdminSupabase();

  const [{ data: integration }, { data: conversations }] = await Promise.all([
    admin.from('integration_settings').select('enabled,status,token_last4,raw_settings,webhook_secret,notes').eq('law_firm_id', profile.law_firm_id).eq('provider', 'whatsapp').maybeSingle(),
    admin
      .from('whatsapp_conversations')
      .select('*, clients(id,name,whatsapp,phone)')
      .eq('law_firm_id', profile.law_firm_id)
      .order('last_message_at', { ascending: false })
      .limit(50),
  ]);

  const selectedId = query?.conversa || conversations?.[0]?.id || '';
  const selected = (conversations || []).find((item: any) => item.id === selectedId) || conversations?.[0] || null;
  const { data: messages } = selected
    ? await admin
        .from('whatsapp_messages')
        .select('*')
        .eq('law_firm_id', profile.law_firm_id)
        .eq('conversation_id', selected.id)
        .order('created_at', { ascending: true })
    : { data: [] as any[] };

  const active = Boolean(integration?.enabled && integration?.token_last4 && integration?.raw_settings?.phone_number_id);

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Central inicial para mensagens enviadas e recebidas pela API oficial da Meta."
        action={<Link href="/app/integracoes" className="btn btn-secondary">Configurar API</Link>}
      />

      {!active && (
        <section className="card mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          WhatsApp API ainda não está totalmente configurado. Vá em Integrações, preencha Access Token e Phone Number ID, salve e teste a conexão.
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-[#eee4d4] p-4">
            <h2 className="text-base font-black text-slate-950">Conversas</h2>
            <p className="text-xs text-slate-500">Mensagens são vinculadas ao cliente pelo telefone/WhatsApp.</p>
          </div>

          <div className="max-h-[620px] overflow-auto">
            {!(conversations || []).length && <p className="p-4 text-sm font-bold text-slate-500">Nenhuma conversa recebida ainda.</p>}
            {(conversations || []).map((conversation: any) => (
              <Link
                key={conversation.id}
                href={`/app/whatsapp?conversa=${conversation.id}`}
                className={`block border-b border-[#f0e7d8] p-4 hover:bg-[#fffaf2] ${selected?.id === conversation.id ? 'bg-[#fbf7ef]' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <b className="max-w-[220px] truncate text-sm text-slate-950">{titleFor(conversation)}</b>
                  {conversation.unread_count > 0 && <span className="badge badge-info">{conversation.unread_count}</span>}
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">{conversation.phone}</p>
                <p className="mt-1 text-[11px] text-slate-400">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString('pt-BR') : ''}</p>
              </Link>
            ))}
          </div>
        </section>

        {selected ? (
          <WhatsappThread conversation={selected} messages={messages || []} />
        ) : (
          <section className="card p-8 text-sm font-bold text-slate-500">Selecione uma conversa ou aguarde a primeira mensagem recebida via webhook.</section>
        )}
      </div>
    </div>
  );
}
