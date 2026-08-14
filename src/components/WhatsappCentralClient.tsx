'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, CheckCheck, Filter, MessageCircle, RefreshCw, Search, Settings2, UserCheck, Users, X } from 'lucide-react';
import { WhatsappThread, type WhatsappTemplateOption } from '@/components/WhatsappThread';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { WhatsappSettingsCenter } from '@/components/WhatsappSettingsCenter';

function titleFor(conversation: any) {
  return conversation?.clients?.name || conversation?.lead?.name || conversation?.lead_name || conversation?.phone || 'Conversa';
}

function initials(name: string) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function shortTime(value?: string) {
  if (!value) return 'Sem mensagens';
  try {
    return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function conversationListTime(value?: string) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startToday.getTime() - startMessageDay.getTime()) / 86400000);

    if (diffDays === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Ontem';
    if (diffDays > 1 && diffDays < 7) {
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      return weekday.charAt(0).toUpperCase() + weekday.slice(1);
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: date.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
  } catch {
    return '';
  }
}

function messagePreview(item: any) {
  const type = String(item?.last_message_type || 'text').toLowerCase();
  const rawBody = String(item?.last_message_body || '').trim();
  const fileName = String(item?.last_message_file_name || '').trim();

  if (type === 'image') {
    const caption = rawBody && !/^\[?imagem (recebida|enviada)?\]?$/i.test(rawBody) && rawBody.toLowerCase() !== 'imagem' ? rawBody : '';
    return caption ? `📷 ${caption}` : '📷 Foto';
  }
  if (type === 'audio') return '🎤 Áudio';
  if (type === 'video') {
    const caption = rawBody && !/^\[?vídeo (recebido|enviado)?\]?$/i.test(rawBody) ? rawBody : '';
    return caption ? `🎥 ${caption}` : '🎥 Vídeo';
  }
  if (type === 'document') return `📄 ${fileName || rawBody || 'Documento'}`;
  if (type === 'sticker') return '🖼️ Figurinha';
  if (type === 'reaction') return rawBody ? `Reação ${rawBody}` : 'Reação';
  if (type === 'location') return `📍 ${rawBody || 'Localização'}`;
  if (type === 'poll') return `📊 ${rawBody || 'Enquete'}`;
  if (type === 'event') return `📅 ${rawBody || 'Evento'}`;
  if (type === 'call_permission') return '📞 Solicitação de chamada';
  if (type === 'call_cta') return '📞 Ligar no WhatsApp';
  if (type === 'interactive' || type === 'button') return rawBody || 'Mensagem interativa';
  if (type === 'template') return rawBody || 'Mensagem de modelo';
  return rawBody || 'Mensagem';
}

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesSearch(item: any, query: string) {
  const term = normalizeSearch(query);
  if (!term) return true;
  const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
  const lead = item?.lead || {};
  const haystack = normalizeSearch(`${titleFor(item)} ${item?.phone || ''} ${item?.clients?.phone || ''} ${item?.clients?.whatsapp || ''} ${item?.last_message_body || ''} ${tags} ${lead?.stage || ''} ${lead?.service_interest || ''} ${lead?.source || ''} ${lead?.source_platform || ''} ${lead?.campaign_id || ''} ${lead?.campaign_name || ''} ${lead?.adgroup_id || ''} ${lead?.adgroup_name || ''} ${lead?.ad_id || ''} ${lead?.ad_name || ''} ${lead?.referral_headline || ''} ${lead?.utm_campaign || ''} ${lead?.utm_term || ''} ${item?.assigned_user?.full_name || ''}`);
  return haystack.includes(term);
}

function leadStageLabel(value: string | null | undefined, stages: any[] = []) {
  const stage = (stages || []).find((item: any) => String(item?.stage_key) === String(value || ''));
  return stage?.name || String(value || 'Novo').replace(/_/g, ' ');
}

type WhatsappTab = 'conversas' | 'leads' | 'contatos';
type WhatsappDepartment = 'atendimento' | 'financeiro_juridico';
type WhatsappWorkspaceView = 'atendimento' | 'financeiro_juridico' | 'encerrados' | 'configuracoes';

function dedupeById(items: any[]) {
  const seen = new Set<string>();
  return (items || []).filter((item) => {
    const key = String(item?.id || item?.conversation_id || item?.client_id || item?.phone || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function WhatsappCentralClient({
  initialConversations,
  initialMessages,
  initialSelectedId,
  initialContacts = [],
  initialDraft = '',
  templates = [],
  initialTags = [],
  initialLeadStages = [],
  initialPreferences = {},
  initialAutoReplies = [],
  initialLeadTracking = null,
  initialView = 'atendimento',
  initialTab = '',
  initialSettingsSection = 'tags',
  canConfigure = false,
  teamUsers = [],
  currentUserId = '',
  currentUserName = '',
}: {
  initialConversations: any[];
  initialMessages: any[];
  initialSelectedId: string;
  initialContacts?: any[];
  initialDraft?: string;
  templates?: WhatsappTemplateOption[];
  initialTags?: any[];
  initialLeadStages?: any[];
  initialPreferences?: any;
  initialAutoReplies?: any[];
  initialLeadTracking?: any;
  initialView?: WhatsappWorkspaceView;
  initialTab?: WhatsappTab | '';
  initialSettingsSection?: string;
  canConfigure?: boolean;
  teamUsers?: any[];
  currentUserId?: string;
  currentUserName?: string;
}) {
  const [conversations, setConversations] = useState(dedupeById(initialConversations || []));
  const [contacts, setContacts] = useState(dedupeById(initialContacts || []));
  const [messages, setMessages] = useState(initialMessages || []);
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'mine' | 'unassigned' | string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [contactTypeFilter, setContactTypeFilter] = useState<'all' | 'leads' | 'clients' | 'unregistered'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WhatsappWorkspaceView>(initialView || 'atendimento');
  const [tagCatalog, setTagCatalog] = useState<any[]>(initialTags || []);
  const [leadStages, setLeadStages] = useState<any[]>(initialLeadStages || []);
  const [preferences, setPreferences] = useState<any>(initialPreferences || {});
  const [autoReplies, setAutoReplies] = useState<any[]>(initialAutoReplies || []);
  const [leadTracking, setLeadTracking] = useState<any>(initialLeadTracking || null);
  const [templateOptions, setTemplateOptions] = useState<WhatsappTemplateOption[]>(templates || []);
  const initialSelected = [...(initialConversations || []), ...(initialContacts || [])].find((item: any) => item?.id === initialSelectedId);
  const [activeDepartment, setActiveDepartment] = useState<WhatsappDepartment>(() => {
    if (initialView === 'financeiro_juridico') return 'financeiro_juridico';
    if (initialView === 'atendimento') return 'atendimento';
    return initialSelected?.department === 'financeiro_juridico' ? 'financeiro_juridico' : 'atendimento';
  });
  const [activeTab, setActiveTab] = useState<WhatsappTab>(() => {
    if (initialTab === 'leads' || initialTab === 'contatos' || initialTab === 'conversas') return initialTab;
    if (initialSelected?.contact || initialSelected?.virtual) return 'contatos';
    if (initialSelected?.lead && !initialSelected?.client_id) return 'leads';
    return 'conversas';
  });
  const [draft, setDraft] = useState(initialDraft || '');
  const [loading, setLoading] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(!initialSelectedId);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const selectedIdRef = useRef(initialSelectedId || '');
  const queryRef = useRef('');
  const loadingRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { queryRef.current = query; }, [query]);

  const allTargets = useMemo(() => dedupeById([...(conversations || []), ...(contacts || [])]), [conversations, contacts]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return allTargets.find((item: any) => item.id === selectedId || item.conversation_id === selectedId) || null;
  }, [allTargets, selectedId]);

  useEffect(() => {
    if (!selected || selected?.virtual || selected?.contact) return;
    const selectedDepartment: WhatsappDepartment = selected?.department === 'financeiro_juridico' ? 'financeiro_juridico' : 'atendimento';

    // O setor da conversa e a caixa de entrada que o usuário está visualizando são
    // estados diferentes. Ao transferir uma conversa, não mudamos automaticamente
    // de caixa: a conversa pode continuar aberta, mas a lista permanece na origem.
    if (selected?.closed_at && workspaceView !== 'encerrados') {
      setWorkspaceView('encerrados');
      setActiveTab('conversas');
      window.history.replaceState(null, '', `/app/whatsapp?view=encerrados&conversa=${encodeURIComponent(String(selected?.id || selectedIdRef.current))}`);
    } else if (workspaceView === 'encerrados' && !selected?.closed_at) {
      setActiveDepartment(selectedDepartment);
      setWorkspaceView(selectedDepartment);
      window.history.replaceState(null, '', `/app/whatsapp?view=${selectedDepartment}&conversa=${encodeURIComponent(String(selected?.id || selectedIdRef.current))}`);
    }
  }, [selected, workspaceView]);

  useEffect(() => {
    if ((workspaceView === 'financeiro_juridico' || workspaceView === 'encerrados') && activeTab !== 'conversas') {
      setActiveTab('conversas');
      return;
    }
    if (selected?.client_id && !selected?.lead && activeTab === 'leads') setActiveTab('conversas');
  }, [workspaceView, activeTab, selected?.client_id, selected?.lead]);

  const activeConversations = useMemo(() => {
    return (conversations || []).filter((conversation: any) => !conversation?.closed_at);
  }, [conversations]);

  const closedConversations = useMemo(() => {
    return (conversations || [])
      .filter((conversation: any) => Boolean(conversation?.closed_at))
      .slice()
      .sort((a: any, b: any) => new Date(b?.closed_at || 0).getTime() - new Date(a?.closed_at || 0).getTime());
  }, [conversations]);

  const departmentConversations = useMemo(() => {
    if (workspaceView === 'encerrados') return closedConversations;
    return activeConversations.filter((conversation: any) => (conversation?.department || 'atendimento') === activeDepartment);
  }, [activeConversations, closedConversations, activeDepartment, workspaceView]);

  const activeTeamUsers = useMemo(() => (teamUsers || []).filter((user: any) => user?.status === 'ativo' && user?.auth_user_id), [teamUsers]);

  const matchesOperationalFilters = useCallback((conversation: any) => {
    if (assigneeFilter === 'mine' && String(conversation?.assigned_to || '') !== String(currentUserId || '')) return false;
    if (assigneeFilter === 'unassigned' && conversation?.assigned_to) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'mine' && assigneeFilter !== 'unassigned' && String(conversation?.assigned_to || '') !== String(assigneeFilter)) return false;
    if (tagFilter && !(Array.isArray(conversation?.tag_ids) && conversation.tag_ids.map(String).includes(String(tagFilter)))) return false;
    const leadFiltersVisible = activeTab === 'leads' || (activeTab === 'conversas' && contactTypeFilter === 'leads');
    if (leadFiltersVisible && stageFilter && String(conversation?.lead?.stage || '') !== String(stageFilter)) return false;
    if (leadFiltersVisible && sourceFilter && String(conversation?.lead?.source_platform || '') !== String(sourceFilter)) return false;
    if (activeTab === 'conversas' && contactTypeFilter !== 'all') {
      const stageConfig = (leadStages || []).find((stage: any) => String(stage?.stage_key) === String(conversation?.lead?.stage || ''));
      const isOpenLead = Boolean(conversation?.lead) && String(stageConfig?.outcome || 'open') !== 'won';
      const isClient = Boolean(conversation?.client_id || conversation?.clients?.id);
      if (contactTypeFilter === 'leads' && !isOpenLead) return false;
      if (contactTypeFilter === 'clients' && !isClient) return false;
      if (contactTypeFilter === 'unregistered' && (isOpenLead || isClient)) return false;
    }
    if (unreadOnly && Number(conversation?.unread_count || 0) <= 0) return false;
    return true;
  }, [assigneeFilter, currentUserId, tagFilter, stageFilter, sourceFilter, contactTypeFilter, activeTab, leadStages, unreadOnly]);

  const filteredConversations = useMemo(() => {
    return departmentConversations.filter((conversation: any) => matchesSearch(conversation, query) && matchesOperationalFilters(conversation));
  }, [departmentConversations, query, matchesOperationalFilters]);

  const filteredLeads = useMemo(() => {
    const outcomeByStage = new Map((leadStages || []).map((stage: any) => [String(stage.stage_key), String(stage.outcome || 'open')]));
    return departmentConversations.filter((conversation: any) => conversation?.lead && outcomeByStage.get(String(conversation?.lead?.stage || '')) !== 'won' && matchesSearch(conversation, query) && matchesOperationalFilters(conversation));
  }, [departmentConversations, query, leadStages, matchesOperationalFilters]);

  const filteredContacts = useMemo(() => {
    if (activeDepartment !== 'atendimento') return [];
    return (contacts || []).filter((contact: any) => matchesSearch(contact, query));
  }, [contacts, query, activeDepartment]);

  const conversationCount = departmentConversations.length;
  const leadCount = filteredLeads.length;
  const contactCount = workspaceView === 'atendimento' ? contacts.length : 0;
  const closedCount = closedConversations.length;
  const isSearching = Boolean(query.trim());
  const leadSingular = String(preferences?.lead_label_singular || 'Lead');
  const leadPlural = String(preferences?.lead_label_plural || 'Leads');
  const leadFiltersVisible = activeTab === 'leads' || (activeTab === 'conversas' && contactTypeFilter === 'leads');
  const activeFilterCount = (assigneeFilter !== 'all' ? 1 : 0) + (tagFilter ? 1 : 0) + (leadFiltersVisible && stageFilter ? 1 : 0) + (leadFiltersVisible && sourceFilter ? 1 : 0) + (activeTab === 'conversas' && contactTypeFilter !== 'all' ? 1 : 0) + (unreadOnly ? 1 : 0);

  function clearOperationalFilters() {
    setAssigneeFilter('all');
    setTagFilter('');
    setStageFilter('');
    setSourceFilter('');
    setContactTypeFilter('all');
    setUnreadOnly(false);
  }

  const load = useCallback(async (targetId?: string, silent = true, searchTerm?: string) => {
    if (loadingRef.current) {
      // Eventos do Realtime podem chegar enquanto a API ainda está respondendo.
      // Em vez de perder o evento, fazemos mais uma leitura assim que a atual terminar.
      refreshQueuedRef.current = true;
      return;
    }

    const effectiveTargetId = typeof targetId === 'string' ? targetId : selectedIdRef.current;
    const effectiveSearch = typeof searchTerm === 'string' ? searchTerm : queryRef.current;
    if (!silent) setLoading(true);
    loadingRef.current = true;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);

    try {
      const params = new URLSearchParams();
      if (effectiveTargetId) params.set('conversationId', effectiveTargetId);
      params.set('_', String(Date.now()));

      const response = await fetch(`/api/whatsapp/conversations?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Erro ao carregar mensagens.');

      const nextConversations = dedupeById(result.conversations || []);
      const nextContacts = dedupeById(result.contacts || []);
      const selectionUnchanged = selectedIdRef.current === effectiveTargetId;
      const nextSelectedId = selectionUnchanged ? (result.selectedId || effectiveTargetId || '') : selectedIdRef.current;

      setConversations(nextConversations);
      setContacts(nextContacts);

      // Uma resposta antiga não pode reabrir uma conversa que o usuário fechou
      // com Esc ou substituir uma conversa selecionada depois da requisição.
      if (selectionUnchanged) {
        setMessages((result.messages || []).filter((message: any) => {
          if (!nextSelectedId) return false;
          if (!message?.conversation_id) return true;
          return String(message.conversation_id) === String(nextSelectedId);
        }));
      }

      // Se um contato virtual acabou de receber/enviar a primeira mensagem,
      // a API devolve o ID da conversa real e a interface migra automaticamente.
      if (selectionUnchanged && nextSelectedId && nextSelectedId !== selectedIdRef.current) {
        selectedIdRef.current = nextSelectedId;
        setSelectedId(nextSelectedId);
        setActiveTab('conversas');
        window.history.replaceState(null, '', `/app/whatsapp?conversa=${encodeURIComponent(nextSelectedId)}`);
      }

      setLastUpdate(result.fetchedAt || new Date().toISOString());
      setError(null);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Não foi possível atualizar as conversas.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      loadingRef.current = false;
      if (!silent) setLoading(false);

      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        window.setTimeout(() => {
          window.dispatchEvent(new Event('advos:whatsapp-refresh'));
        }, 60);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshFromRealtime = () => {
      void load(selectedIdRef.current, true, queryRef.current);
    };

    const connectRealtime = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;

        // Depois do hardening, as tabelas do WhatsApp usam RLS para authenticated.
        // O Realtime precisa receber explicitamente o JWT antes de avaliar essas policies.
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        } else {
          setRealtimeStatus('fallback');
        }

        channel = supabase
          .channel('advos-whatsapp-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, refreshFromRealtime)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, refreshFromRealtime)
          .subscribe((status) => {
            if (!active) return;
            if (status === 'SUBSCRIBED') {
              setRealtimeStatus('live');
              refreshFromRealtime();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              // O polling abaixo continua mantendo a tela atualizada mesmo se o WebSocket cair.
              setRealtimeStatus('fallback');
            }
          });
      } catch {
        if (active) setRealtimeStatus('fallback');
      }
    };

    void connectRealtime();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => { void poll(); }, delay);
    };

    const poll = async () => {
      if (cancelled) return;
      await load(selectedIdRef.current, true, queryRef.current);
      // Realtime é o caminho rápido; polling é a rede de segurança.
      // Em primeiro plano, no máximo ~2 s para refletir uma mensagem recebida.
      schedule(document.hidden ? 8000 : 2000);
    };

    const refreshNow = () => {
      if (timerId) window.clearTimeout(timerId);
      void poll();
    };

    void poll();
    window.addEventListener('focus', refreshNow);
    window.addEventListener('advos:whatsapp-refresh', refreshNow);
    document.addEventListener('visibilitychange', refreshNow);

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener('focus', refreshNow);
      window.removeEventListener('advos:whatsapp-refresh', refreshNow);
      document.removeEventListener('visibilitychange', refreshNow);
    };
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => load(selectedIdRef.current, true, query), 250);
    return () => window.clearTimeout(id);
  }, [query, load]);

  const closeConversation = useCallback(() => {
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setDraft('');
    setMobileListOpen(true);
    const view = workspaceView === 'encerrados' ? 'encerrados' : activeDepartment;
    window.history.replaceState(null, '', `/app/whatsapp?view=${view}`);
  }, [activeDepartment, workspaceView]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !selectedIdRef.current) return;
      event.preventDefault();
      closeConversation();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeConversation]);

  function selectConversation(item: any, kind?: WhatsappTab) {
    const id = String(item?.id || '');
    if (!id) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    const nextDepartment: WhatsappDepartment = item?.contact || item?.virtual ? 'atendimento' : item?.department === 'financeiro_juridico' ? 'financeiro_juridico' : 'atendimento';
    const nextWorkspace: WhatsappWorkspaceView = item?.closed_at ? 'encerrados' : nextDepartment;
    setActiveDepartment(nextDepartment);
    setWorkspaceView(nextWorkspace);
    if (item?.contact || item?.virtual) setActiveTab('contatos');
    else setActiveTab(item?.closed_at ? 'conversas' : (kind || (item?.lead && !item?.client_id ? 'leads' : 'conversas')));
    window.history.replaceState(null, '', `/app/whatsapp?view=${nextWorkspace}&conversa=${encodeURIComponent(id)}`);
    setDraft('');
    setMobileListOpen(false);
    setMessages([]);
    load(id, false, queryRef.current);
  }

  function switchDepartment(department: WhatsappDepartment) {
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setDraft('');
    setMobileListOpen(true);
    setActiveDepartment(department);
    setWorkspaceView(department);
    setActiveTab('conversas');
    setQuery('');
    window.history.replaceState(null, '', `/app/whatsapp?view=${department}`);
  }

  function switchWorkspace(view: WhatsappWorkspaceView) {
    if (view === 'atendimento' || view === 'financeiro_juridico') {
      switchDepartment(view);
      return;
    }
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setDraft('');
    setMobileListOpen(true);
    setWorkspaceView(view);
    setQuery('');
    window.history.replaceState(null, '', `/app/whatsapp?view=${view}`);
  }

  function handleThreadSent(nextConversationId?: string) {
    const target = nextConversationId || selected?.id || selectedId;
    if (target && target !== selectedIdRef.current) {
      selectedIdRef.current = target;
      setSelectedId(target);
      setActiveTab('conversas');
      window.history.replaceState(null, '', `/app/whatsapp?view=${workspaceView === 'encerrados' ? 'encerrados' : activeDepartment}&conversa=${encodeURIComponent(target)}`);
    }
    load(target, false, queryRef.current);
  }

  function handleConversationChanged(change?: any) {
    if (change?.closed) {
      setWorkspaceView('encerrados');
      setActiveTab('conversas');
      setQuery('');
      window.history.replaceState(null, '', `/app/whatsapp?view=encerrados&conversa=${encodeURIComponent(selectedIdRef.current)}`);
    } else if (change?.reopened) {
      const department: WhatsappDepartment = change?.department === 'financeiro_juridico' ? 'financeiro_juridico' : 'atendimento';
      setActiveDepartment(department);
      setWorkspaceView(department);
      setActiveTab('conversas');
      setQuery('');
      window.history.replaceState(null, '', `/app/whatsapp?view=${department}&conversa=${encodeURIComponent(selectedIdRef.current)}`);
    }
    void load(selectedIdRef.current, false, queryRef.current);
  }

  function renderListItem(item: any, kind: WhatsappTab) {
    const active = selected?.id === item.id || selected?.conversation_id === item.id;
    const title = titleFor(item);
    const isContact = kind === 'contatos' || item.contact || item.virtual;
    const isLead = kind === 'leads' || Boolean(!item?.client_id && item?.lead);
    const itemTags = Array.isArray(item?.tags) ? item.tags.filter(Boolean).slice(0, 2) : [];
    return (
      <button
        type="button"
        key={`${kind}-${item.id}`}
        onClick={() => selectConversation(item, kind)}
        className={`flex w-full items-center gap-2 border-b border-[#eef1ef] px-2.5 py-2 text-left transition hover:bg-[#f5f6f6] ${active ? 'bg-[#e7f3ef]' : 'bg-white'}`}
      >
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-black text-white ${isContact ? 'bg-[#25D366]' : isLead ? 'bg-[#d97706]' : 'bg-[#075e54]'}`}>
          {isContact ? <Users size={14} /> : initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          {isContact ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-[11px] text-slate-950">{title}</b>
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-700">contato</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{item.phone}</p>
              <p className="mt-0.5 truncate text-[9px] text-emerald-700">{item.has_conversation ? 'Abrir conversa existente' : 'Contato cadastrado. Clique para iniciar.'}</p>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <b className="min-w-0 flex-1 truncate text-[11px] text-slate-950">{title}</b>
                  {item?.closed_at && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-black uppercase text-slate-600">{item?.closed_from_department === 'financeiro_juridico' ? 'Jur./Fin.' : 'Atendimento'}</span>}
                  {isLead && !item?.closed_at && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[7px] font-black uppercase text-amber-700">{leadStageLabel(item?.lead?.stage, leadStages)}</span>}
                  {isLead && item?.lead?.source_platform === 'meta' && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[7px] font-black uppercase text-blue-700">Meta Ads</span>}
                  {isLead && item?.lead?.source_platform === 'google' && <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[7px] font-black uppercase text-red-700">Google Ads</span>}
                </div>
                <span className={`shrink-0 text-[9px] font-bold ${Number(item.unread_count || 0) > 0 ? 'text-[#1fa855]' : 'text-slate-400'}`}>
                  {conversationListTime(item.closed_at || item.last_message_at)}
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <div className={`flex min-w-0 flex-1 items-center gap-1 ${Number(item.unread_count || 0) > 0 ? 'font-bold text-slate-700' : 'text-slate-500'}`}>
                  {item.last_message_direction === 'outbound' && (
                    item.last_message_status === 'read' || item.last_message_status === 'delivered'
                      ? <CheckCheck size={12} className={`shrink-0 ${item.last_message_status === 'read' ? 'text-sky-500' : 'text-slate-400'}`} aria-hidden="true" />
                      : <Check size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
                  )}
                  <p className="min-w-0 flex-1 truncate text-[10px]" title={messagePreview(item)}>{messagePreview(item)}</p>
                </div>
                {Number(item.unread_count || 0) > 0 && (
                  <span className="grid min-h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[#25D366] px-1 text-[8px] font-black leading-none text-white">
                    {Number(item.unread_count) > 99 ? '99+' : item.unread_count}
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1 text-[8px] font-bold text-slate-400">
                <UserCheck size={9} className="shrink-0" />
                <span className={`truncate ${item?.assigned_user?.full_name ? 'text-slate-500' : 'text-amber-600'}`}>{item?.assigned_user?.full_name || 'Sem responsável'}</span>
              </div>
              {isLead && item?.lead?.qualified_automatically && (
                <div className="mt-1 flex min-w-0 items-center gap-1 text-[8px] font-black text-emerald-700">
                  <span className="shrink-0">Qualificado {Number(item?.lead?.qualification_score || 0)}/100</span>
                  {item?.lead?.service_interest && <span className="truncate font-bold text-slate-500">· {item.lead.service_interest}</span>}
                </div>
              )}
              {itemTags.length > 0 && (
                <div className="mt-1 flex min-w-0 gap-1 overflow-hidden">
                  {itemTags.map((tag: string) => <span key={tag} className="max-w-[88px] truncate rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-bold text-slate-600">#{tag}</span>)}
                  {Array.isArray(item?.tags) && item.tags.length > itemTags.length && <span className="text-[7px] font-bold text-slate-400">+{item.tags.length - itemTags.length}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </button>
    );
  }

  function renderList() {
    if (isSearching) {
      const result = activeTab === 'leads' ? filteredLeads : activeTab === 'contatos' ? filteredContacts : filteredConversations;
      if (!result.length) return <p className="p-3 text-xs font-bold text-slate-500">Nenhum resultado encontrado neste setor.</p>;
      return result.map((item: any) => renderListItem(item, activeTab));
    }

    if (activeTab === 'leads') {
      if (!filteredLeads.length) return <p className="p-3 text-xs font-bold text-slate-500">{`Nenhum ${leadSingular.toLowerCase()} neste setor. Números desconhecidos que enviarem mensagem entram aqui automaticamente.`}</p>;
      return filteredLeads.map((item: any) => renderListItem(item, 'leads'));
    }

    if (activeTab === 'contatos') {
      if (!filteredContacts.length) return <p className="p-3 text-xs font-bold text-slate-500">Nenhum contato com WhatsApp cadastrado em Clientes.</p>;
      return filteredContacts.map((item: any) => renderListItem(item, 'contatos'));
    }

    if (!filteredConversations.length) return <p className="p-3 text-xs font-bold text-slate-500">{workspaceView === 'encerrados' ? 'Nenhuma conversa encerrada.' : 'Nenhuma conversa neste setor ainda.'}</p>;
    return filteredConversations.map((item: any) => renderListItem(item, 'conversas'));
  }

  return (
    <div className="whatsapp-workspace flex min-h-0 flex-col gap-2">
      <nav className="whatsapp-workspace-nav flex flex-wrap gap-2 rounded-2xl border border-[#e6dccb] bg-white p-2 shadow-sm" aria-label="Áreas do WhatsApp">
        <button type="button" onClick={() => switchWorkspace('atendimento')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${workspaceView === 'atendimento' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-[#fbf7ef]'}`}><MessageCircle size={14}/>Atendimento</button>
        <button type="button" onClick={() => switchWorkspace('financeiro_juridico')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${workspaceView === 'financeiro_juridico' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-[#fbf7ef]'}`}><Users size={14}/>Financeiro/Jurídico</button>
        <button type="button" onClick={() => switchWorkspace('encerrados')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${workspaceView === 'encerrados' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-[#fbf7ef]'}`}><Archive size={14}/>Encerrados{closedCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${workspaceView === 'encerrados' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{closedCount}</span>}</button>
        {canConfigure && <button type="button" onClick={() => switchWorkspace('configuracoes')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${workspaceView === 'configuracoes' ? 'bg-[#075e54] text-white' : 'text-slate-600 hover:bg-[#fbf7ef]'}`}><Settings2 size={14}/>Configurações</button>}
      </nav>

      {workspaceView === 'configuracoes' && canConfigure ? (
        <WhatsappSettingsCenter
          tags={tagCatalog}
          stages={leadStages}
          preferences={preferences}
          autoReplies={autoReplies}
          leadTracking={leadTracking}
          templates={templateOptions as any}
          initialSection={initialSettingsSection}
          onSettingsChanged={(next) => { setTagCatalog(next.tags || []); setLeadStages(next.stages || []); setPreferences(next.preferences || {}); setAutoReplies(next.autoReplies || []); setLeadTracking(next.leadTracking || null); }}
          onTemplatesChanged={(next) => setTemplateOptions(next as WhatsappTemplateOption[])}
        />
      ) : (
    <div className="whatsapp-central grid h-[calc(100dvh-168px)] min-h-[540px] min-w-0 gap-3 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className={`whatsapp-panel flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#d6ddd6] bg-white shadow-sm ${mobileListOpen ? 'flex' : 'hidden xl:flex'}`}>
        <div className="shrink-0 border-b border-[#d6ddd6] bg-[#f0f2f5] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-slate-950">WhatsApp</h2>
              <p className="truncate text-[10px] text-slate-500">Atendimento, funil e relacionamento jurídico.</p>
            </div>
            <button
              type="button"
              title="Atualizar agora"
              aria-label="Atualizar agora"
              onClick={() => load(selectedId, false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d6ddd6] bg-white text-slate-600 hover:bg-[#fbf7ef]"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>


          {workspaceView === 'encerrados' ? (
            <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-[9px] font-bold text-slate-600">Atendimentos concluídos. Uma nova mensagem do cliente reabre a conversa automaticamente.</div>
          ) : activeDepartment === 'atendimento' ? (
            <div className="mt-2 grid grid-cols-3 rounded-full bg-[#e2e8e5] p-1 text-[9px] font-black text-slate-600">
              <button type="button" onClick={() => setActiveTab('conversas')} className={`inline-flex items-center justify-center gap-1 rounded-full px-1.5 py-1.5 transition ${activeTab === 'conversas' ? 'bg-white text-[#075e54] shadow-sm' : 'hover:bg-white/50'}`}>
                <MessageCircle size={11} /> Conversas <span className="text-[8px] opacity-70">{conversationCount}</span>
              </button>
              <button type="button" onClick={() => setActiveTab('leads')} className={`inline-flex items-center justify-center gap-1 rounded-full px-1.5 py-1.5 transition ${activeTab === 'leads' ? 'bg-white text-amber-700 shadow-sm' : 'hover:bg-white/50'}`}>
                {leadPlural} <span className="text-[8px] opacity-70">{leadCount}</span>
              </button>
              <button type="button" onClick={() => setActiveTab('contatos')} className={`inline-flex items-center justify-center gap-1 rounded-full px-1.5 py-1.5 transition ${activeTab === 'contatos' ? 'bg-white text-[#075e54] shadow-sm' : 'hover:bg-white/50'}`}>
                <Users size={11} /> Contatos <span className="text-[8px] opacity-70">{contactCount}</span>
              </button>
            </div>
          ) : (
            <div className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-[9px] font-bold text-indigo-700">Conversas transferidas para acompanhamento jurídico ou financeiro.</div>
          )}

          <div className="relative mt-2">
            <div className="flex items-center gap-1.5">
              <div className="field-with-icon min-w-0 flex-1">
                <Search size={13} className="field-with-icon__icon text-slate-400" aria-hidden="true" />
                <input
                  className="input field-with-icon__input rounded-[20px] border-transparent bg-white text-[11px] shadow-sm"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={workspaceView === 'encerrados' ? 'Pesquisar conversa encerrada ou tag' : activeTab === 'leads' ? `Pesquisar ${leadSingular.toLowerCase()} ou tag` : 'Pesquisar conversa, contato ou tag'}
                  aria-label="Pesquisar no WhatsApp"
                />
              </div>
              {activeTab !== 'contatos' && (
                <button type="button" onClick={() => setFilterOpen((value) => !value)} className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border shadow-sm ${filterOpen || activeFilterCount ? 'border-[#075e54] bg-[#e7f3ef] text-[#075e54]' : 'border-transparent bg-white text-slate-500'}`} title="Filtrar conversas" aria-label="Filtrar conversas">
                  <Filter size={13} />
                  {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#075e54] px-1 text-[8px] font-black text-white">{activeFilterCount}</span>}
                </button>
              )}
            </div>

            {filterOpen && activeTab !== 'contatos' && (
              <div className="whatsapp-filter-panel absolute right-0 top-[calc(100%+6px)] z-50 w-full rounded-xl border border-[#d6ddd6] bg-white p-2 shadow-xl">
                <div className="mb-2 flex items-center justify-between gap-2"><b className="text-[9px] uppercase tracking-wide text-slate-500">Filtros</b><div className="flex items-center gap-2">{activeFilterCount > 0 && <button type="button" onClick={clearOperationalFilters} className="inline-flex items-center gap-1 text-[9px] font-black text-red-600 hover:text-red-700"><X size={9}/>Limpar</button>}<button type="button" onClick={() => setFilterOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar filtros"><X size={12}/></button></div></div>
                <div className="grid gap-1.5">
                  {activeTab === 'conversas' && <select value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value as 'all' | 'leads' | 'clients' | 'unregistered')} className="input whatsapp-filter-control" aria-label="Filtrar por tipo de contato"><option value="all">Todos os contatos</option><option value="leads">Somente leads</option><option value="clients">Somente clientes</option><option value="unregistered">Sem cadastro</option></select>}
                  <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="input whatsapp-filter-control" aria-label="Filtrar por responsável">
                    <option value="all">Todos os responsáveis</option>
                    <option value="mine">Minhas conversas</option>
                    <option value="unassigned">Sem responsável</option>
                    {activeTeamUsers.map((user: any) => <option key={user.auth_user_id} value={user.auth_user_id}>{user.full_name || user.email}</option>)}
                  </select>
                  <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="input whatsapp-filter-control" aria-label="Filtrar por tag">
                    <option value="">Todas as tags</option>
                    {(tagCatalog || []).filter((tag: any) => tag.active !== false).map((tag: any) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </select>
                  {leadFiltersVisible && <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="input whatsapp-filter-control" aria-label="Filtrar por etapa do lead"><option value="">Todas as etapas</option>{(leadStages || []).filter((stage: any) => stage.active !== false).map((stage: any) => <option key={stage.stage_key} value={stage.stage_key}>{stage.name}</option>)}</select>}
                  {leadFiltersVisible && <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="input whatsapp-filter-control" aria-label="Filtrar por origem do lead"><option value="">Todas as origens</option><option value="meta">Meta Ads</option><option value="google">Google Ads</option></select>}
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] font-bold leading-normal text-slate-600"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> Somente não lidas</label>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="whatsapp-list-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {renderList()}
        </div>

        <div className="shrink-0 border-t border-[#d6ddd6] bg-[#f0f2f5] px-2.5 py-1.5 text-[9px] font-bold text-slate-500">
          {error ? error : lastUpdate ? `${realtimeStatus === 'live' ? 'Ao vivo' : 'Atualização automática'} · ${shortTime(lastUpdate)}` : 'Conectando atualização automática...' }
        </div>
      </section>

      {selected ? (
        <div key={String(selected?.id || selectedId)} className={`${mobileListOpen ? 'hidden xl:block' : 'block'} h-full min-w-0`}>
          <WhatsappThread conversation={selected} messages={messages || []} templates={templateOptions.filter((template: any) => template.active !== false)} availableTags={tagCatalog} leadStages={leadStages} leadLabel={leadSingular} teamUsers={teamUsers} currentUserId={currentUserId} currentUserName={currentUserName} canConfigure={canConfigure} live={realtimeStatus === 'live'} initialDraft={draft} onDraftApplied={() => setDraft('')} onSent={handleThreadSent} onBack={closeConversation} onConversationChanged={handleConversationChanged} />
        </div>
      ) : (
        <section className="whatsapp-panel hidden min-h-[320px] rounded-[16px] border border-[#e8dfcf] bg-white p-8 text-sm font-bold text-slate-500 shadow-sm xl:block">
          <div className="mx-auto grid max-w-sm place-items-center gap-3 text-center">
            <MessageCircle size={34} className="text-[#075e54]" />
            <p>Selecione uma conversa, lead ou contato. Nenhuma conversa é aberta automaticamente.</p>
          </div>
        </section>
      )}
    </div>
      )}
    </div>
  );
}
