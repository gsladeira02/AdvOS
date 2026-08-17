export async function recordWhatsappEvent(admin: any, input: {
  lawFirmId: string;
  conversationId: string;
  actorId?: string | null;
  eventType: string;
  description?: string | null;
  metadata?: Record<string, any> | null;
}) {
  const { error } = await admin.from('whatsapp_conversation_events').insert({
    law_firm_id: input.lawFirmId,
    conversation_id: input.conversationId,
    actor_id: input.actorId || null,
    event_type: input.eventType,
    description: input.description || null,
    metadata: input.metadata || {},
  });
  if (error) console.error('Não foi possível registrar histórico do WhatsApp:', error.message);
}

export async function loadWhatsappConversationContext(admin: any, lawFirmId: string, conversationId: string) {
  const [notesResult, eventsResult, profilesResult] = await Promise.all([
    admin
      .from('whatsapp_internal_notes')
      .select('id,conversation_id,author_id,body,created_at,updated_at')
      .eq('law_firm_id', lawFirmId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('whatsapp_conversation_events')
      .select('id,conversation_id,actor_id,event_type,description,metadata,created_at')
      .eq('law_firm_id', lawFirmId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('profiles')
      .select('auth_user_id,full_name,email,role,status')
      .eq('law_firm_id', lawFirmId),
  ]);

  if (notesResult.error) throw new Error(notesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (profilesResult.error) throw new Error(profilesResult.error.message);

  const byUser = new Map((profilesResult.data || []).map((profile: any) => [String(profile.auth_user_id || ''), profile]));
  const notes = (notesResult.data || []).map((note: any) => ({
    ...note,
    author: note.author_id ? byUser.get(String(note.author_id)) || null : null,
  }));
  const events = (eventsResult.data || []).map((event: any) => ({
    ...event,
    actor: event.actor_id ? byUser.get(String(event.actor_id)) || null : null,
  }));
  return { notes, events };
}
