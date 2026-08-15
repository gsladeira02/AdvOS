'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  Forward,
  Share2,
  FileText,
  Image as ImageIcon,
  Laugh,
  Mic,
  Paperclip,
  Phone,
  Plus,
  Send,
  Square,
  Smile,
  Sparkles,
  Trash2,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { renderMessageTemplate } from '@/lib/messageTemplates';
import { WhatsappSpecialComposer, type WhatsappSpecialKind } from '@/components/WhatsappSpecialComposer';
import { WhatsappCallPanel } from '@/components/WhatsappCallPanel';
import { WhatsappConversationControls } from '@/components/WhatsappConversationControls';
import { WhatsappLocationCard } from '@/components/WhatsappLocationCard';
import { ClientAvatar } from '@/components/ClientAvatar';
import { isStandalonePwa, transcribeInBrowser } from '@/lib/browserWhisper';

export type WhatsappTemplateOption = {
  id: string;
  name: string;
  slug?: string;
  shortcut?: string;
  category?: string;
  body: string;
  active?: boolean;
  meta_template_name?: string | null;
  meta_template_language?: string | null;
};

type NormalizedTemplate = WhatsappTemplateOption & { normalizedShortcut: string };

type MessageListItem = Record<string, any> & { optimistic?: boolean };

type RecordedAudioState = {
  file: File;
  url: string;
  seconds: number;
  ready: boolean;
  preparing?: boolean;
  error?: string | null;
  originalMime?: string | null;
};

const emojiOptions = ['😀', '😂', '🙏', '👍', '👏', '❤️', '🔥', '✅', '⚖️', '📄', '📌', '👀', '🤝', '🙌', '😅', '🤔', '😎', '🚀', '💬', '⭐'];
const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '✅'];
const quickStickers = ['👍', '🙏', '✅', '⚖️', '📄', '🤝', '🚀', '⭐'];

function messageTime(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function normalizeShortcut(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearch(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function titleForForward(item: any) {
  return String(item?.clients?.name || item?.lead?.name || item?.lead_name || item?.name || item?.phone || item?.clients?.phone || 'Contato');
}

function firstName(name?: string | null) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function fileSizeLabel(size?: number | null) {
  const bytes = Number(size || 0);
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function cleanPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function statusValue(status?: string | null) {
  return String(status || '').toLowerCase();
}


function statusRank(status?: string | null) {
  const value = statusValue(status);
  if (value === 'failed') return 99;
  if (value === 'read') return 4;
  if (value === 'delivered') return 3;
  if (value === 'sent') return 2;
  if (value === 'received') return 1;
  return 0;
}

function bestStatus(current?: string | null, incoming?: string | null) {
  const next = statusValue(incoming);
  const old = statusValue(current);
  if (!next) return current || null;
  if (!old) return incoming || null;
  // Falha precisa aparecer imediatamente. Fora isso, não deixamos a interface voltar de lida para enviada.
  if (next === 'failed') return incoming || null;
  if (old === 'failed' && next !== 'sent' && next !== 'delivered' && next !== 'read') return current || null;
  return statusRank(next) >= statusRank(old) ? incoming || null : current || null;
}

function mergeMessageRecord(current: MessageListItem, incoming: MessageListItem) {
  const merged: MessageListItem = {
    ...current,
    ...incoming,
    status: bestStatus(current?.status, incoming?.status) || incoming?.status || current?.status,
    delivered_at: incoming?.delivered_at || current?.delivered_at || null,
    read_at: incoming?.read_at || current?.read_at || null,
    error_message: incoming?.error_message || current?.error_message || null,
    media_url: incoming?.media_url || current?.media_url || null,
    storage_path: incoming?.storage_path || current?.storage_path || null,
    mime_type: incoming?.mime_type || current?.mime_type || null,
    file_name: incoming?.file_name || current?.file_name || null,
    file_size: incoming?.file_size || current?.file_size || null,
    transcription_text: incoming?.transcription_text ?? current?.transcription_text ?? null,
    transcription_status: incoming?.transcription_status ?? current?.transcription_status ?? null,
    transcription_model: incoming?.transcription_model ?? current?.transcription_model ?? null,
    transcription_error: incoming?.transcription_error ?? current?.transcription_error ?? null,
    transcribed_at: incoming?.transcribed_at ?? current?.transcribed_at ?? null,
    transcribed_by: incoming?.transcribed_by ?? current?.transcribed_by ?? null,
  };

  if (incoming?.id && !String(incoming.id).startsWith('local-')) merged.optimistic = false;
  return merged;
}
function StatusTicks({ status }: { status?: string | null }) {
  const value = statusValue(status);
  if (value === 'failed') return <AlertTriangle size={13} className="text-red-500" aria-label="Falhou" />;
  if (value === 'read') return <CheckCheck size={14} className="text-[#34b7f1]" aria-label="Lida" />;
  if (value === 'delivered') return <CheckCheck size={14} className="text-slate-500" aria-label="Entregue" />;
  if (value === 'sent') return <Check size={14} className="text-slate-500" aria-label="Enviada" />;
  return <Check size={14} className="text-slate-400" aria-label="Pendente" />;
}

function mediaKind(message: any) {
  const type = String(message?.message_type || message?.type || '').toLowerCase();
  const mime = String(message?.mime_type || '').toLowerCase();
  const name = String(message?.file_name || '').toLowerCase();
  if (type === 'sticker' || mime === 'image/webp' || name.endsWith('.webp')) return 'sticker';
  if (type === 'image' || mime.startsWith('image/')) return 'image';
  if (type === 'video' || mime.startsWith('video/')) return 'video';
  if (type === 'audio' || mime.startsWith('audio/')) return 'audio';
  if (type === 'document' || message?.file_name || message?.storage_path) return 'document';
  return 'text';
}
function mediaDisplayUrl(message: any) {
  const id = String(message?.id || '').trim();
  if (id && !id.startsWith('local-')) return `/api/whatsapp/media/${encodeURIComponent(id)}`;

  // Somente previews locais podem usar URL direta (blob:). Mídia persistida sempre
  // passa pelo endpoint autenticado do AdvOS, evitando URLs externas arbitrárias no DOM.
  const direct = String(message?.media_url || message?.raw_payload?.advos_media_url || '').trim();
  if (id.startsWith('local-') && direct.startsWith('blob:')) return direct;
  return '';
}

function mediaDownloadUrl(message: any) {
  const display = mediaDisplayUrl(message);
  if (!display) return '';
  return display.startsWith('/api/') ? `${display}?download=1` : display;
}

function stableMessageKey(message: any) {
  return String(message?.external_id || message?.id || `${message?.conversation_id || ''}-${message?.direction}-${message?.created_at}-${message?.body}-${message?.file_name || ''}`);
}

function sameMessage(a: any, b: any) {
  if (!a || !b) return false;
  if (a.id && b.id && String(a.id) === String(b.id)) return true;
  if (a.external_id && b.external_id && String(a.external_id) === String(b.external_id)) return true;
  const aTime = new Date(a.created_at || 0).getTime();
  const bTime = new Date(b.created_at || 0).getTime();
  const closeTime = Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) < 120000;
  return closeTime
    && String(a.direction || '') === String(b.direction || '')
    && String(a.body || '') === String(b.body || '')
    && String(a.message_type || '') === String(b.message_type || '')
    && String(a.file_name || '') === String(b.file_name || '');
}

function isValidMp3File(file?: File | null) {
  if (!file) return false;
  const mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return (mime === 'audio/mpeg' || mime === 'audio/mp3') && name.endsWith('.mp3');
}

function hasMp3Header(bytes: Uint8Array) {
  if (!bytes || bytes.length < 3) return false;
  // ID3 tag no início ou sync word de frame MPEG. Isso valida conteúdo real, não só MIME/nome.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

async function isRealMp3File(file?: File | null) {
  if (!isValidMp3File(file)) return false;
  const header = new Uint8Array(await file!.slice(0, 4).arrayBuffer());
  return hasMp3Header(header);
}

function floatTo16BitPcm(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] || 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function mixToMono(audioBuffer: AudioBuffer) {
  const length = audioBuffer.length;
  const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
  const mono = new Float32Array(length);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += (data[i] || 0) / channels;
    }
  }

  return mono;
}

function resampleMono(input: Float32Array, inputRate: number, outputRate = 16000) {
  if (!input.length || !Number.isFinite(inputRate) || inputRate <= 0 || inputRate === outputRate) return input;
  const outputLength = Math.max(1, Math.round(input.length * outputRate / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let i = 0; i < outputLength; i += 1) {
    const sourcePosition = i * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[i] = (input[left] || 0) * (1 - fraction) + (input[right] || 0) * fraction;
  }
  return output;
}

function encodeMonoWav(samples: Float32Array, sampleRate = 16000) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function convertBlobToTranscriptionWav(blob: Blob, messageId: string) {
  const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Este navegador não consegue preparar o áudio. Use Chrome ou Edge atualizado.');

  const audioContext = new AudioContextCtor();
  try {
    const decoded: AudioBuffer = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const mono = mixToMono(decoded);
    const resampled = resampleMono(mono, decoded.sampleRate, 16000);
    const wavBlob = encodeMonoWav(resampled, 16000);
    if (!wavBlob.size) throw new Error('O áudio preparado ficou vazio.');
    if (wavBlob.size > 25 * 1024 * 1024) throw new Error('O áudio convertido ultrapassa o limite de 25 MB para transcrição.');
    return new File([wavBlob], `audio-${messageId}.wav`, { type: 'audio/wav' });
  } catch (error: any) {
    if (String(error?.message || '').includes('25 MB')) throw error;
    throw new Error('Não foi possível decodificar este áudio do WhatsApp. Atualize a página e tente novamente pelo Chrome ou Edge.');
  } finally {
    if (typeof audioContext.close === 'function') audioContext.close().catch(() => null);
  }
}

async function decodeBlobToWhisperAudio(blob: Blob) {
  const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('A transcrição local exige um navegador desktop atualizado, como Chrome ou Edge.');

  const audioContext = new AudioContextCtor();
  try {
    const decoded: AudioBuffer = await audioContext.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const mono = mixToMono(decoded);
    const resampled = resampleMono(mono, decoded.sampleRate, 16000);
    if (!resampled.length) throw new Error('O áudio preparado ficou vazio.');
    return resampled;
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('navegador desktop') || message.includes('vazio')) throw error;
    throw new Error('O navegador não conseguiu decodificar este áudio do WhatsApp. Use Chrome ou Edge atualizado no computador.');
  } finally {
    if (typeof audioContext.close === 'function') audioContext.close().catch(() => null);
  }
}

function friendlyBrowserTranscriptionError(error: any) {
  const raw = String(error?.message || '').trim();
  if (!raw) return 'Não foi possível transcrever o áudio no navegador.';
  if (/fetch|network|failed to fetch|load model|download/i.test(raw)) {
    return 'Não foi possível baixar o modelo gratuito de transcrição. Verifique a internet e tente novamente.';
  }
  if (/memory|out of memory|allocation/i.test(raw)) {
    return 'O computador ficou sem memória para executar a transcrição local. Feche outras abas e tente novamente.';
  }
  return raw;
}

function transcriptionMime(blob: Blob, message: any) {
  const blobMime = String(blob.type || '').toLowerCase().split(';')[0].trim();
  const messageMime = String(message?.mime_type || '').toLowerCase().split(';')[0].trim();
  const generic = !blobMime || blobMime === 'application/octet-stream' || blobMime === 'binary/octet-stream';
  return generic ? messageMime : blobMime;
}

async function convertRecordedBlobToMp3File(blob: Blob) {
  const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Seu navegador não permite preparar áudio em MP3. Use Chrome ou Edge atualizado.');

  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContextCtor();

  try {
    const decoded: AudioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    const pcm = floatTo16BitPcm(mono);
    const lameModule: any = await import('lamejsfixbug121');
    const Mp3Encoder = lameModule.Mp3Encoder || lameModule.default?.Mp3Encoder || lameModule.default?.default?.Mp3Encoder;
    if (!Mp3Encoder) throw new Error('Codificador MP3 não carregou.');

    const encoder = new Mp3Encoder(1, decoded.sampleRate, 64);
    const chunks: Uint8Array[] = [];
    const blockSize = 1152;

    for (let i = 0; i < pcm.length; i += blockSize) {
      const part = pcm.subarray(i, i + blockSize);
      const encoded = encoder.encodeBuffer(part);
      if (encoded?.length) chunks.push(new Uint8Array(encoded));
    }

    const flushed = encoder.flush();
    if (flushed?.length) chunks.push(new Uint8Array(flushed));

    const mp3Blob = new Blob(chunks, { type: 'audio/mpeg' });
    if (!mp3Blob.size) throw new Error('O áudio preparado ficou vazio. Grave novamente.');

    const header = new Uint8Array(await mp3Blob.slice(0, 4).arrayBuffer());
    if (!hasMp3Header(header)) {
      throw new Error('O codificador não gerou um MP3 válido. Atualize com Ctrl+F5 e tente gravar de novo.');
    }

    return new File([mp3Blob], `audio-whatsapp-${Date.now()}.mp3`, { type: 'audio/mpeg' });
  } finally {
    if (typeof audioContext.close === 'function') audioContext.close().catch(() => null);
  }
}


function appendMessagePreservingHistory(currentMessages: MessageListItem[], newMessage: MessageListItem) {
  const key = stableMessageKey(newMessage);
  const next: MessageListItem[] = [];
  let inserted = false;

  for (const item of currentMessages || []) {
    const sameId = newMessage.id && item.id && String(item.id) === String(newMessage.id);
    const sameExternal = newMessage.external_id && item.external_id && String(item.external_id) === String(newMessage.external_id);
    const sameLocalEquivalent = item.optimistic
      && item.direction === newMessage.direction
      && item.body === newMessage.body
      && Math.abs(new Date(item.created_at || 0).getTime() - new Date(newMessage.created_at || 0).getTime()) < 120000;

    if (sameId || sameExternal || sameLocalEquivalent || stableMessageKey(item) === key) {
      if (!inserted) {
        next.push(mergeMessageRecord(item, newMessage));
        inserted = true;
      }
      continue;
    }
    next.push(item);
  }

  if (!inserted) next.push(newMessage);
  return next.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function mergeMessageLists(serverMessages: MessageListItem[], currentMessages: MessageListItem[]) {
  const merged: MessageListItem[] = [];

  for (const message of serverMessages || []) {
    if (!message) continue;
    const index = merged.findIndex((item) => sameMessage(item, message));
    if (index >= 0) merged[index] = mergeMessageRecord(merged[index], message);
    else merged.push(message);
  }

  // Nunca trocar a tela por uma lista parcial. Isso evita o bug em que, após enviar,
  // a API retornava só a mensagem nova por alguns instantes e o histórico sumia até F5.
  // Quando o servidor traz a mesma mensagem com status novo, a versão do servidor vence.
  for (const current of currentMessages || []) {
    if (!current) continue;
    const index = merged.findIndex((message) => sameMessage(current, message));
    if (index >= 0) merged[index] = mergeMessageRecord(current, merged[index]);
    else merged.push(current);
  }

  return merged.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

export function WhatsappThread({
  conversation,
  messages,
  templates = [],
  availableTags = [],
  leadStages = [],
  leadLabel = 'Lead',
  teamUsers = [],
  currentUserId = '',
  currentUserName = '',
  canConfigure = false,
  live = true,
  initialDraft = '',
  onDraftApplied,
  onSent,
  onBack,
  onConversationChanged,
  forwardTargets = [],
}: {
  conversation: any;
  messages: any[];
  templates?: WhatsappTemplateOption[];
  availableTags?: any[];
  leadStages?: any[];
  leadLabel?: string;
  teamUsers?: any[];
  currentUserId?: string;
  currentUserName?: string;
  canConfigure?: boolean;
  live?: boolean;
  initialDraft?: string;
  onDraftApplied?: () => void;
  onSent?: (conversationId?: string) => void;
  onBack?: () => void;
  onConversationChanged?: (change?: any) => void;
  forwardTargets?: any[];
}) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<MessageListItem[]>(messages || []);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [specialKind, setSpecialKind] = useState<WhatsappSpecialKind | null>(null);
  const [callMode, setCallMode] = useState<'voice' | 'video' | null>(null);
  const [reactionOpenId, setReactionOpenId] = useState<string | null>(null);
  const [deleteOpenId, setDeleteOpenId] = useState<string | null>(null);
  const [forwardSelectionMode, setForwardSelectionMode] = useState(false);
  const [selectedForwardIds, setSelectedForwardIds] = useState<Set<string>>(() => new Set());
  const [forwardTargetId, setForwardTargetId] = useState('');
  const [forwardPickerOpen, setForwardPickerOpen] = useState(false);
  const [forwardSending, setForwardSending] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(() => new Set());
  const [transcriptionProgressById, setTranscriptionProgressById] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudioState | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const previousThreadIdentityRef = useRef('');
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const threadLoadingRef = useRef(false);
  const appliedDraftRef = useRef('');

  const visibleItems = items || [];
  const isClosed = Boolean(conversation?.closed_at);
  const teamUserById = useMemo(() => new Map((teamUsers || []).filter((user: any) => user?.auth_user_id).map((user: any) => [String(user.auth_user_id), user])), [teamUsers]);

  function senderNameForMessage(message: any) {
    if (message?.direction !== 'outbound') return '';
    if (message?.raw_payload?.advos?.automated) return `Resposta automática · ${String(message?.raw_payload?.advos?.auto_reply_rule_name || 'Automação')}`;
    if (message?.sent_by_name) return String(message.sent_by_name);
    const sentBy = String(message?.sent_by || '');
    const user: any = sentBy ? teamUserById.get(sentBy) : null;
    if (user?.full_name) return String(user.full_name);
    if (sentBy && sentBy === String(currentUserId || '') && currentUserName) return currentUserName;
    return sentBy ? 'Usuário do escritório' : 'Escritório · histórico';
  }

  function clearRecordedAudio() {
    setRecordedAudio((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function stopRecorderTracks() {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function bestAudioMimeType() {
    // Preferir WebM/Opus no Chrome/Edge porque ele decodifica bem no navegador para conversão MP3.
    // Safari normalmente usa MP4; também será convertido para MP3 antes do envio.
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg; codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
    if (typeof MediaRecorder === 'undefined') return '';
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function refreshThreadMessages(silent = true) {
    const conversationId = String(conversation?.id || '');
    if (!conversationId || threadLoadingRef.current) return;
    threadLoadingRef.current = true;
    try {
      const params = new URLSearchParams({ conversationId, _: String(Date.now()) });
      const response = await fetch(`/api/whatsapp/messages?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível atualizar a conversa.');
      const nextConversationId = String(result.conversationId || result.selectedId || conversationId);
      if (nextConversationId && nextConversationId !== conversationId) {
        onSent?.(nextConversationId);
      }
      const serverMessages = result.messages || [];
      const excludedMessageIds = new Set((result.excludedMessageIds || []).map((id: any) => String(id)));
      setItems((current) => {
        const retained = current.filter((item: any) => !excludedMessageIds.has(String(item?.id || '')));
        if (!serverMessages.length) return retained;
        return mergeMessageLists(serverMessages, retained);
      });
      if (!silent) setFeedback('Conversa atualizada.');
    } catch (error: any) {
      if (!silent) setFeedback(error?.message || 'Erro ao atualizar conversa.');
    } finally {
      threadLoadingRef.current = false;
    }
  }

  useEffect(() => {
    const draft = String(initialDraft || '').trim();
    const conversationId = String(conversation?.id || '');
    const key = `${conversationId}:${draft}`;
    if (!draft || !conversationId || appliedDraftRef.current === key) return;
    appliedDraftRef.current = key;
    setText(draft);
    setShortcutOpen(false);
    setEmojiOpen(false);
    setStickerOpen(false);
    setAttachOpen(false);
    setFeedback('Mensagem carregada do Financeiro. Revise e envie pela conversa.');
    onDraftApplied?.();
    window.setTimeout(() => textareaRef.current?.focus(), 100);
  }, [initialDraft, conversation?.id, onDraftApplied]);

  useEffect(() => {
    if (!live) return;
    refreshThreadMessages(true);
    const interval = window.setInterval(() => refreshThreadMessages(true), 900);
    const onFocus = () => refreshThreadMessages(true);
    const onVisibility = () => {
      if (!document.hidden) refreshThreadMessages(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversation?.id, live]);

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      try {
        recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      } catch {}
      stopRecorderTracks();
      setRecordedAudio((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    const conversationId = String(conversation?.id || '');
    const cleanServerMessages = (messages || []).filter((message: any) => {
      if (!message?.conversation_id) return true;
      return String(message.conversation_id) === conversationId;
    });

    setItems((current) => {
      if (!cleanServerMessages.length && current.length) return current;
      return mergeMessageLists(cleanServerMessages, current);
    });
  }, [messages, conversation?.id]);

  useEffect(() => {
    const conversationId = String(conversation?.id || '');
    const identity = `${conversation?.client_id || ''}:${conversation?.phone || ''}`;
    const previousIdentity = previousThreadIdentityRef.current;
    const sameContactAsBefore = Boolean(previousIdentity && previousIdentity === identity);
    previousThreadIdentityRef.current = identity;

    const cleanServerMessages = (messages || []).filter((message: any) => {
      if (!message?.conversation_id) return true;
      return String(message.conversation_id) === conversationId;
    });

    setItems((current) => {
      if (cleanServerMessages.length) return mergeMessageLists(cleanServerMessages, sameContactAsBefore ? current : []);
      if (sameContactAsBefore && current.length) return current;
      return [];
    });
    setNewMessagesBelow(false);
    setFeedback(null);
    setReactionOpenId(null);
    setDeleteOpenId(null);
    cancelForwardSelection();
    setTranscriptionProgressById({});
    if (conversationId && !conversation?.virtual) {
      window.setTimeout(() => refreshThreadMessages(true), 80);
      window.setTimeout(() => refreshThreadMessages(true), 650);
    }
  // A troca de conversa precisa limpar a conversa anterior imediatamente, mas sem apagar o histórico
  // quando um contato virtual vira conversa real depois do primeiro envio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    setIsAtBottom(true);
    setNewMessagesBelow(false);
  }

  function handleMessageScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    setIsAtBottom(nearBottom);
    if (nearBottom) setNewMessagesBelow(false);
  }

  useEffect(() => {
    window.setTimeout(() => scrollToBottom('auto'), 0);
  }, [conversation?.id]);

  useEffect(() => {
    if (isAtBottom) {
      window.setTimeout(() => scrollToBottom('smooth'), 0);
    } else {
      setNewMessagesBelow(true);
    }
  }, [visibleItems.length]);

  const title = useMemo(() => {
    return conversation?.clients?.name || conversation?.lead?.name || conversation?.lead_name || conversation?.phone || 'Conversa';
  }, [conversation]);

  const phoneHref = cleanPhone(conversation?.phone);

  const shortcuts = useMemo(() => {
    return (templates || [])
      .map((template) => {
        const shortcut = normalizeShortcut(template.shortcut || template.slug || template.name);
        return shortcut ? { ...template, normalizedShortcut: shortcut } : null;
      })
      .filter(Boolean) as NormalizedTemplate[];
  }, [templates]);

  function renderTemplate(template: WhatsappTemplateOption) {
    const clientName = conversation?.clients?.name || conversation?.lead?.name || conversation?.lead_name || '';
    return renderMessageTemplate(template.body, {
      cliente: clientName,
      primeiro_nome: firstName(clientName),
      telefone_escritorio: '',
      escritorio: 'escritório',
    });
  }

  function templateMessageFromText(raw: string) {
    const typed = raw.trim();
    if (!typed.startsWith('/')) return raw.trim();

    const key = normalizeShortcut(typed.slice(1).split(/\s+/)[0]);
    const template = shortcuts.find((item) => item.normalizedShortcut === key);
    if (!template) return raw.trim();

    return renderTemplate(template);
  }

  const slashTerm = useMemo(() => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('/')) return null;
    return normalizeSearch(trimmed.slice(1).split(/\s+/)[0] || '');
  }, [text]);

  const shortcutSuggestions = useMemo(() => {
    if (slashTerm === null) return [];
    const term = slashTerm;
    const result = shortcuts.filter((template) => {
      if (!term) return true;
      const haystack = normalizeSearch(`${template.normalizedShortcut} ${template.name} ${template.category || ''}`);
      return haystack.includes(term);
    });
    return result.slice(0, 24);
  }, [shortcuts, slashTerm]);

  const previewTemplate = useMemo(() => {
    const typed = text.trim();
    if (!typed.startsWith('/')) return null;
    const key = normalizeShortcut(typed.slice(1).split(/\s+/)[0]);
    return shortcuts.find((item) => item.normalizedShortcut === key) || null;
  }, [text, shortcuts]);

  function insertTemplate(template: NormalizedTemplate) {
    setText(renderTemplate(template));
    setShortcutOpen(false);
    setEmojiOpen(false);
    setStickerOpen(false);
    setFeedback(`Modelo inserido: ${template.name}.`);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function appendToText(value: string) {
    setText((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${value}`);
    setShortcutOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function transcribeAudio(message: any) {
    const messageId = String(message?.id || '').trim();
    if (isStandalonePwa()) {
      setFeedback('A transcrição fica disponível apenas no navegador desktop.');
      return;
    }
    if (!messageId || messageId.startsWith('local-')) {
      setFeedback('Aguarde o áudio sincronizar antes de transcrever.');
      return;
    }
    if (String(message?.transcription_text || '').trim()) return;

    setTranscribingIds((current) => new Set(current).add(messageId));
    setTranscriptionProgressById((current) => ({ ...current, [messageId]: 'Preparando áudio…' }));
    setItems((current) => current.map((item: any) => item.id === messageId ? { ...item, transcription_status: 'processing', transcription_error: null } : item));
    setFeedback(null);

    try {
      const mediaUrl = mediaDisplayUrl(message);
      if (!mediaUrl) throw new Error('O áudio ainda não está disponível para transcrição.');

      const mediaResponse = await fetch(mediaUrl, { cache: 'no-store' });
      if (!mediaResponse.ok) throw new Error('Não foi possível carregar o áudio para transcrição.');
      const blob = await mediaResponse.blob();
      if (!blob.size) throw new Error('O áudio está vazio.');

      setTranscriptionProgressById((current) => ({ ...current, [messageId]: 'Preparando áudio no navegador…' }));
      const audio = await decodeBlobToWhisperAudio(blob);
      const localResult = await transcribeInBrowser(audio, (status) => {
        setTranscriptionProgressById((current) => ({ ...current, [messageId]: status }));
      });

      if (!localResult.text) throw new Error('Nenhuma fala reconhecível foi encontrada neste áudio.');
      setTranscriptionProgressById((current) => ({ ...current, [messageId]: 'Salvando transcrição…' }));

      const response = await fetch('/api/whatsapp/messages/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          transcription: localResult.text,
          model: `browser:${localResult.model}`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'A transcrição foi concluída, mas não pôde ser salva.');

      setItems((current) => current.map((item: any) => item.id === messageId ? {
        ...item,
        transcription_text: result.transcription || localResult.text,
        transcription_status: 'completed',
        transcription_model: result.model || `browser:${localResult.model}`,
        transcription_error: null,
        transcribed_at: result.transcribed_at || new Date().toISOString(),
      } : item));
      setFeedback(result?.cached ? 'Transcrição carregada.' : 'Áudio transcrito gratuitamente no navegador.');
    } catch (error: any) {
      const errorMessage = friendlyBrowserTranscriptionError(error);
      setItems((current) => current.map((item: any) => item.id === messageId ? { ...item, transcription_status: 'error', transcription_error: errorMessage } : item));
      setFeedback(errorMessage);
    } finally {
      setTranscribingIds((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
      setTranscriptionProgressById((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  }

  async function shareMessage(message: any) {
    try {
      const body = String(message?.body || '').trim();
      const mediaUrl = mediaDisplayUrl(message);
      if (navigator.share) {
        if (mediaUrl && String(message?.message_type || '').toLowerCase() !== 'text') {
          const response = await fetch(mediaUrl, { credentials: 'same-origin' });
          if (!response.ok) throw new Error('Não foi possível preparar o arquivo para compartilhar.');
          const blob = await response.blob();
          const name = String(message?.file_name || `mensagem-${message?.id || Date.now()}`);
          const sharedFile = new File([blob], name, { type: blob.type || message?.mime_type || 'application/octet-stream' });
          const shareData: any = { files: [sharedFile] };
          if (body && !/^\[?(imagem|vídeo|audio|áudio|documento|figurinha)/i.test(body)) shareData.text = body;
          if (!navigator.canShare || navigator.canShare(shareData)) {
            await navigator.share(shareData);
          } else {
            await navigator.share({ text: body || name });
          }
        } else {
          await navigator.share({ text: body || 'Mensagem do WhatsApp' });
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(body || '');
        setFeedback('Mensagem copiada. Seu navegador não suporta compartilhamento direto.');
      } else {
        throw new Error('Este navegador não suporta compartilhamento.');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') setFeedback(error?.message || 'Não foi possível compartilhar a mensagem.');
    }
  }

  function startForwardSelection(message: any) {
    if (message?.direction !== 'inbound') return;
    const id = String(message?.id || '');
    if (!id || id.startsWith('local-')) {
      setFeedback('Esta mensagem ainda não está sincronizada. Aguarde um instante e tente novamente.');
      return;
    }
    setForwardSelectionMode(true);
    setSelectedForwardIds(new Set([id]));
    setForwardTargetId('');
    setDeleteOpenId(null);
    setReactionOpenId(null);
  }

  function toggleForwardSelection(message: any) {
    if (!forwardSelectionMode) return;
    const id = String(message?.id || '');
    if (!id || id.startsWith('local-')) return;
    setSelectedForwardIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelForwardSelection() {
    setForwardSelectionMode(false);
    setSelectedForwardIds(new Set());
    setForwardTargetId('');
    setForwardPickerOpen(false);
    setForwardSending(false);
  }

  async function forwardSelectedMessages() {
    if (!forwardTargetId || selectedForwardIds.size === 0) return;
    const target = (forwardTargets || []).find((item: any) => String(item?.id || item?.conversation_id || '') === String(forwardTargetId));
    const phone = String(target?.phone || target?.clients?.whatsapp || target?.clients?.phone || '').trim();
    if (!phone) { setFeedback('A conversa escolhida não possui WhatsApp válido.'); return; }

    const selectedMessages = visibleItems
      .filter((item: any) => selectedForwardIds.has(String(item?.id || '')))
      .sort((a: any, b: any) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime());
    if (!selectedMessages.length) return;

    setForwardSending(true);
    try {
      const response = await fetch('/api/whatsapp/messages/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageIds: selectedMessages.map((message: any) => message.id),
          targetPhone: phone,
          targetClientId: target?.client_id || target?.clients?.id || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível encaminhar as mensagens.');
      const sent = Number(result?.sentCount || selectedMessages.length);
      setFeedback(`${sent} ${sent === 1 ? 'mensagem encaminhada' : 'mensagens encaminhadas'} com sucesso.`);
      cancelForwardSelection();
      onSent?.(result.conversationId);
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível encaminhar as mensagens.');
    } finally {
      setForwardSending(false);
    }
  }

  async function deleteMessage(messageId: string, scope: 'for_me' | 'for_everyone') {
    setDeleteOpenId(null);
    if (!messageId || String(messageId).startsWith('local-')) {
      setItems((current) => current.filter((item: any) => item.id !== messageId));
      return;
    }
    if (scope === 'for_everyone') {
      const confirmed = window.confirm('Apagar esta mensagem para todos os usuários do AdvOS? A API oficial da Meta não permite que o AdvOS remova retroativamente a mensagem do WhatsApp do cliente.');
      if (!confirmed) return;
    }
    try {
      const response = await fetch('/api/whatsapp/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, scope }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível apagar.');
      setItems((current) => current.filter((item: any) => item.id !== messageId));
      setFeedback(result?.warning || (scope === 'for_me' ? 'Mensagem apagada apenas para você.' : 'Mensagem apagada para todos no AdvOS.'));
      onSent?.(conversation?.id);
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível apagar a mensagem. Tente novamente.');
    }
  }

  async function clearConversation() {
    if (!conversation?.id || conversation?.virtual) return;
    const ok = window.confirm('Apagar todas as mensagens dessa conversa dentro do AdvOS? Isso não apaga no celular do cliente.');
    if (!ok) return;
    try {
      const response = await fetch('/api/whatsapp/messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, scope: 'conversation' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível limpar conversa.');
      setItems([]);
      setFeedback('Conversa limpa no AdvOS.');
      onSent?.(conversation.id);
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao limpar conversa.');
    }
  }

  async function reactToMessage(message: any, emoji: string) {
    const id = String(message?.id || '');
    if (!id || id.startsWith('local-')) {
      setFeedback('Aguarde a mensagem sincronizar antes de reagir.');
      return;
    }
    setReactionOpenId(null);
    setItems((current) => current.map((item) => item.id === id ? { ...item, reaction_emoji: emoji } : item));
    try {
      const response = await fetch('/api/whatsapp/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id, emoji }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível reagir.');
      if (result.warning) setFeedback(`Reação salva no AdvOS. Meta: ${result.warning}`);
      else setFeedback('Reação enviada.');
      onSent?.(conversation?.id);
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao reagir mensagem.');
    }
  }

  async function sendTextMessage(message: string) {
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: conversation.phone,
        client_id: conversation.client_id,
        message,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar.');
    return result;
  }

  async function sendFileMessage(caption: string, selectedFile: File | null = file, options: { recordedAudio?: boolean } = {}) {
    if (!selectedFile) throw new Error('Nenhum arquivo selecionado.');
    const form = new FormData();
    form.set('file', selectedFile);
    form.set('phone', conversation.phone || '');
    form.set('client_id', conversation.client_id || '');
    form.set('caption', caption || '');
    if (options.recordedAudio) form.set('recorded_audio', '1');

    const response = await fetch('/api/whatsapp/send-media', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar arquivo.');
    return result;
  }

  function optimisticFileMessage(result: any, selectedFile: File, message = ''): MessageListItem {
    if (result.message?.id) {
      return { ...result.message, optimistic: false };
    }

    const type = result.type || mediaKind({ mime_type: selectedFile.type, file_name: selectedFile.name });
    return {
      id: result.externalId || `local-${Date.now()}`,
      external_id: result.externalId || null,
      conversation_id: result.conversationId || conversation.id,
      direction: 'outbound',
      message_type: type,
      body: message || (type === 'audio' ? '[Áudio enviado]' : type === 'sticker' ? '[Figurinha]' : selectedFile.name),
      status: 'sent',
      created_at: new Date().toISOString(),
      file_name: selectedFile.name,
      file_size: selectedFile.size,
      mime_type: selectedFile.type,
      media_url: null,
      storage_path: null,
      sent_by: currentUserId || null,
      sent_by_name: currentUserName || null,
      optimistic: true,
    };
  }

  async function sendRecordedAudio(audioFile: File) {
    if (sending) return;
    if (!(await isRealMp3File(audioFile))) {
      setFeedback('O áudio ainda não é um MP3 real. Apague, grave novamente, aguarde aparecer “Áudio pronto em MP3” e escute a prévia antes de enviar.');
      return;
    }
    setSending(true);
    setFeedback('Enviando áudio...');
    try {
      const result = await sendFileMessage('', audioFile, { recordedAudio: true });
      const serverMessage = result.message || {};
      const normalizedAudioFile = new File([audioFile], serverMessage.file_name || audioFile.name, { type: serverMessage.mime_type || audioFile.type });
      setItems((current) => appendMessagePreservingHistory(current, optimisticFileMessage(result, normalizedAudioFile, '[Áudio enviado]')));
      clearRecordedAudio();
      setFeedback('Áudio enviado.');
      onSent?.(result?.conversationId || conversation?.id);
      window.dispatchEvent(new Event('advos:whatsapp-refresh'));
      window.setTimeout(() => refreshThreadMessages(true), 250);
      window.setTimeout(() => refreshThreadMessages(true), 1200);
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar áudio. Grave novamente pelo microfone do AdvOS atualizado ou envie um MP3/M4A/OGG pelo clipe.');
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (recording || sending || recordedAudio) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFeedback('Seu navegador não liberou gravação de áudio. Use Chrome/Edge atualizado ou envie o áudio pelo clipe.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = bestAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const seconds = recordingStartedAtRef.current ? Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)) : recordingSeconds;
        clearRecordingTimer();
        setRecording(false);
        const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(recorderChunksRef.current, { type: finalMimeType });
        recorderChunksRef.current = [];
        stopRecorderTracks();
        if (!blob.size) {
          setFeedback('Áudio vazio. Tente gravar novamente.');
          return;
        }
        const extension = finalMimeType.includes('ogg') ? 'ogg' : finalMimeType.includes('mp4') ? 'm4a' : 'webm';
        const originalAudioFile = new File([blob], `audio-whatsapp-original-${Date.now()}.${extension}`, { type: finalMimeType });
        const url = URL.createObjectURL(blob);
        clearRecordedAudio();

        setRecordedAudio({
          file: originalAudioFile,
          url,
          seconds,
          ready: false,
          preparing: true,
          error: null,
          originalMime: finalMimeType,
        });
        setFeedback('Áudio gravado. Convertendo para MP3 antes de enviar para a Meta...');

        convertRecordedBlobToMp3File(blob)
          .then((mp3File) => {
            const mp3Url = URL.createObjectURL(mp3File);
            setRecordedAudio((current) => {
              if (!current || current.url !== url) {
                URL.revokeObjectURL(mp3Url);
                return current;
              }
              URL.revokeObjectURL(url);
              return { ...current, file: mp3File, url: mp3Url, ready: true, preparing: false, error: null };
            });
            setFeedback('Áudio pronto em MP3. Escute a prévia e clique em enviar.');
          })
          .catch((error: any) => {
            setRecordedAudio((current) => {
              if (!current || current.url !== url) return current;
              return { ...current, ready: false, preparing: false, error: error?.message || 'Não foi possível preparar o áudio.' };
            });
            setFeedback(error?.message || 'Não foi possível preparar o áudio.');
          });
      };

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      setRecordingSeconds(0);
      setFeedback('Gravando áudio. Clique no botão vermelho para parar e ouvir antes de enviar.');
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch (error: any) {
      stopRecorderTracks();
      setRecording(false);
      clearRecordingTimer();
      setFeedback(error?.message || 'Não foi possível acessar o microfone.');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
  }

  async function send() {
    const message = templateMessageFromText(text);
    if ((!message && !file && !recordedAudio) || sending) return;
    if (recordedAudio) {
      if (recordedAudio.preparing || !recordedAudio.ready) {
        setFeedback(recordedAudio.error || 'Aguarde o AdvOS terminar de preparar o áudio em MP3.');
        return;
      }
      await sendRecordedAudio(recordedAudio.file);
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      let result: any;
      let optimistic: MessageListItem;
      if (file) {
        result = await sendFileMessage(message, file);
        optimistic = optimisticFileMessage(result, file, message);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        result = await sendTextMessage(message);
        optimistic = {
          ...(result.message || {}),
          id: result.message?.id || result.externalId || `local-${Date.now()}`,
          external_id: result.externalId || result.message?.external_id || null,
          conversation_id: result.conversationId || result.message?.conversation_id || conversation.id,
          direction: 'outbound',
          message_type: 'text',
          body: message,
          status: result.message?.status || 'sent',
          created_at: result.message?.created_at || new Date().toISOString(),
          sent_by: result.message?.sent_by || currentUserId || null,
          sent_by_name: result.message?.sent_by_name || currentUserName || null,
          optimistic: !result.message?.id,
        };
      }
      setItems((current) => appendMessagePreservingHistory(current, optimistic));
      setText('');
      setShortcutOpen(false);
      setEmojiOpen(false);
      setStickerOpen(false);
      setFeedback(file ? 'Arquivo enviado.' : 'Mensagem enviada.');
      onSent?.(result?.conversationId || conversation?.id);
      window.dispatchEvent(new Event('advos:whatsapp-refresh'));
      window.setTimeout(() => refreshThreadMessages(true), 250);
      window.setTimeout(() => refreshThreadMessages(true), 1200);
    } catch (error: any) {
      setFeedback(error?.message || 'Erro ao enviar pela API oficial.');
    } finally {
      setSending(false);
    }
  }

  function renderMessageBody(message: any) {
    const messageType = String(message?.message_type || '').toLowerCase();
    const structured = message?.raw_payload?.advos || {};

    if (messageType === 'location') {
      const location = structured?.kind === 'location' ? structured : (message?.raw_payload?.location || {});
      const coordinateFallback = String(message?.body || '').match(/(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/);
      const latitude = Number(location?.latitude ?? coordinateFallback?.[1]);
      const longitude = Number(location?.longitude ?? coordinateFallback?.[2]);
      return (
        <WhatsappLocationCard
          latitude={latitude}
          longitude={longitude}
          name={location?.name || null}
          address={location?.address || null}
        />
      );
    }

    if (messageType === 'poll') {
      const options = Array.isArray(structured?.options) ? structured.options : [];
      return (
        <div className="min-w-[230px]">
          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-700">📊 Enquete</div>
          <div className="mb-2 text-xs font-black leading-relaxed">{structured?.question || message.body}</div>
          <div className="space-y-1.5">{options.map((option: string, index: number) => <div key={`${option}-${index}`} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-900">{option}</div>)}</div>
          <div className="mt-2 text-[9px] font-bold text-slate-500">O cliente responde pelos botões interativos do WhatsApp.</div>
        </div>
      );
    }

    if (messageType === 'event') {
      return (
        <div className="min-w-[240px] rounded-xl bg-amber-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">📅 Evento</div>
          <div className="mt-1 text-xs font-black text-slate-900">{structured?.title || 'Evento'}</div>
          <div className="mt-1 text-[10px] font-semibold text-slate-700">{structured?.date || ''}{structured?.time ? ` às ${structured.time}` : ''}</div>
          {structured?.location && <div className="mt-1 text-[10px] font-semibold text-slate-600">📍 {structured.location}</div>}
          {structured?.notes && <div className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600">{structured.notes}</div>}
          <div className="mt-2 flex gap-1"><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-emerald-700">Confirmar</span><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-amber-700">Talvez</span><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-red-700">Não posso</span></div>
        </div>
      );
    }

    if (messageType === 'call_permission' || messageType === 'call_cta') {
      return <div className="min-w-[220px] rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">📞 Chamada no WhatsApp</div><div className="mt-1 whitespace-pre-wrap text-xs font-bold leading-relaxed text-slate-800">{message.body || 'Recurso de chamada enviado.'}</div></div>;
    }

    if (messageType === 'interactive' || messageType === 'button' || messageType === 'call_permission_reply') {
      const interactive = message?.raw_payload?.interactive || {};
      const replyTitle = interactive?.button_reply?.title || interactive?.list_reply?.title || message?.body || 'Resposta interativa';
      return <div className="min-w-[180px]"><div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Resposta</div><div className="mt-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-800">{replyTitle}</div></div>;
    }

    const kind = mediaKind(message);
    const fileName = message.file_name || message.raw_payload?.document?.filename || message.body;
    const mediaUrl = mediaDisplayUrl(message);
    const downloadUrl = mediaDownloadUrl(message);

    if (kind === 'sticker') {
      return (
        <div className="space-y-1.5">
          {mediaUrl ? <img src={mediaUrl} alt={fileName || 'Figurinha'} className="max-h-32 rounded-xl object-contain" /> : <div className="text-4xl leading-none">{message.body && !String(message.body).startsWith('[') ? message.body : '⭐'}</div>}
          {message.body && !String(message.body).startsWith('[') && <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-[#075e54] hover:underline"><Download size={12} /> Salvar</a>}
        </div>
      );
    }

    if (kind === 'image') {
      return (
        <div className="space-y-1.5">
          {mediaUrl ? <img src={mediaUrl} alt={fileName || 'Imagem'} className="max-h-64 rounded-xl object-cover" /> : <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2"><ImageIcon size={16} /> Imagem</div>}
          {message.body && <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-[#075e54] hover:underline"><Download size={12} /> Salvar imagem</a>}
        </div>
      );
    }

    if (kind === 'audio') {
      const messageId = String(message?.id || '');
      const transcription = String(message?.transcription_text || '').trim();
      const isTranscribing = transcribingIds.has(messageId) || message?.transcription_status === 'processing';
      const transcriptionError = String(message?.transcription_error || '').trim();
      const transcriptionProgress = transcriptionProgressById[messageId] || '';
      return (
        <div className="space-y-1.5">
          <div className="rounded-2xl bg-black/5 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Áudio</span>
              {fileSizeLabel(message.file_size) && <span className="text-[10px] font-bold text-slate-500">{fileSizeLabel(message.file_size)}</span>}
            </div>
            {mediaUrl ? (
              <audio controls preload="metadata" className="w-[260px] max-w-full" src={mediaUrl}>
                Seu navegador não suporta reprodução de áudio.
              </audio>
            ) : (
              <div className="text-[11px] font-bold text-slate-500">Áudio recebido. Aguarde a mídia ficar disponível.</div>
            )}
          </div>

          {transcription ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-slate-800">
              <div className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-700"><Sparkles size={11} /> Transcrição</div>
              <div className="whitespace-pre-wrap text-[11px] font-medium leading-relaxed">{transcription}</div>
            </div>
          ) : (
            <div className="browser-only hidden flex-wrap items-center gap-2 md:flex">
              <button
                type="button"
                disabled={!mediaUrl || isTranscribing || messageId.startsWith('local-')}
                onClick={() => void transcribeAudio(message)}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/90 px-2.5 py-1.5 text-[10px] font-black text-[#075e54] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={12} className={isTranscribing ? 'animate-pulse' : ''} />
                {isTranscribing ? (transcriptionProgress || 'Transcrevendo no navegador…') : transcriptionError ? 'Tentar novamente' : 'Transcrever áudio grátis'}
              </button>
              {isTranscribing && transcriptionProgress && <span className="max-w-[280px] text-[9px] font-semibold leading-4 text-slate-500">Processamento local · sem envio para API externa</span>}
              {transcriptionError && !isTranscribing && <span className="max-w-[260px] text-[9px] font-semibold leading-4 text-red-600">{transcriptionError}</span>}
            </div>
          )}

          {message.body && message.body !== '[Áudio recebido]' && <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-[#075e54] hover:underline"><Download size={12} /> Salvar áudio</a>}
        </div>
      );
    }

    if (kind === 'video') {
      return (
        <div className="space-y-1.5">
          {mediaUrl ? <video controls preload="metadata" src={mediaUrl} className="max-h-64 w-[280px] max-w-full rounded-xl bg-black" /> : <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2"><FileText size={16} /> Vídeo recebido</div>}
          {message.body && <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-[#075e54] hover:underline"><Download size={12} /> Salvar vídeo</a>}
        </div>
      );
    }

    if (kind !== 'text') {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2">
            <FileText size={17} className="shrink-0" />
            <div className="min-w-0">
              <b className="break-safe block max-w-[260px] text-[12px] leading-tight">{fileName || 'Arquivo'}</b>
              <span className="text-[10px] font-bold text-slate-500">Documento {fileSizeLabel(message.file_size) ? `• ${fileSizeLabel(message.file_size)}` : ''}</span>
            </div>
          </div>
          {message.body && message.body !== fileName && <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body}</div>}
          {mediaUrl && <div className="flex flex-wrap gap-2"><a href={mediaUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-700 hover:underline">Abrir arquivo</a>{downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-[#075e54] hover:underline"><Download size={12} /> Salvar</a>}</div>}
        </div>
      );
    }

    return <div className="whatsapp-message-body whitespace-pre-wrap leading-relaxed">{message.body || '[mensagem sem texto]'}</div>;
  }

  return (
    <div className="whatsapp-thread relative flex h-[calc(100vh-116px)] min-h-[540px] flex-col overflow-hidden rounded-[18px] border border-[#d6ddd6] bg-[#efe7dc] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#d7ded4] bg-[#075e54] px-3 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" title="Fechar conversa (Esc)">
              <ArrowLeft size={17} className="xl:hidden" />
              <X size={17} className="hidden xl:block" />
            </button>
          )}
          {conversation?.client_id || conversation?.clients?.id ? (
            <ClientAvatar
              clientId={conversation?.client_id || conversation?.clients?.id}
              name={title}
              avatarPath={conversation?.clients?.avatar_path}
              avatarUpdatedAt={conversation?.clients?.avatar_updated_at}
              className="h-9 w-9 ring-1 ring-white/20"
              fallbackClassName="bg-white/20 text-white"
            />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-black">
              {title.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="break-safe text-sm font-black leading-tight">{title}</h2>
            <p className="truncate text-[10px] font-bold text-white/75">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black sm:inline-flex ${live ? 'bg-white/15 text-white' : 'bg-white/10 text-white/70'}`}>
            {live ? <Wifi size={12} /> : <WifiOff size={12} />}
            {live ? 'Ao vivo' : 'Offline'}
          </div>
          <button type="button" disabled={isClosed} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40" title={isClosed ? 'Reabra o atendimento para ligar' : 'Ligação pelo WhatsApp'} onClick={() => setCallMode('voice')}>
            <Phone size={15} />
          </button>
          <button type="button" disabled={isClosed} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40" title={isClosed ? 'Reabra o atendimento para iniciar videochamada' : 'Videochamada pelo WhatsApp'} onClick={() => setCallMode('video')}>
            <Video size={15} />
          </button>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" onClick={clearConversation} title="Limpar conversa no AdvOS" disabled={conversation?.virtual}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <WhatsappConversationControls
        conversation={conversation}
        availableTags={availableTags}
        leadStages={leadStages}
        leadLabel={leadLabel}
        teamUsers={teamUsers}
        currentUserId={currentUserId}
        canConfigure={canConfigure}
        onChanged={onConversationChanged}
      />

      {forwardSelectionMode && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-[#d7ded4] bg-white px-3 py-2.5 shadow-sm">
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-900">Selecionar mensagens</div>
            <div className="text-[10px] font-semibold text-slate-500">{selectedForwardIds.size} {selectedForwardIds.size === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={cancelForwardSelection} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="button" disabled={selectedForwardIds.size === 0 || forwardSending} onClick={() => { setForwardPickerOpen(true); }} className="rounded-lg bg-[#075e54] px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">Continuar</button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleMessageScroll} className="whatsapp-message-scroll h-full overflow-y-scroll overscroll-contain bg-[radial-gradient(circle_at_top_left,rgba(7,94,84,.08),transparent_30%),#e5ddd5] px-3 py-3 pr-2">
          {!visibleItems.length && <p className="mx-auto mt-5 max-w-md rounded-xl bg-white/80 px-3 py-2 text-center text-xs font-bold text-slate-600 shadow-sm">Nenhuma mensagem nessa conversa ainda. Você já pode iniciar por aqui.</p>}
          <div className="space-y-1.5 pb-2">
            {visibleItems.map((message: any) => {
              const outbound = message.direction === 'outbound';
              const bubbleReaction = outbound ? message.client_reaction_emoji || message.reaction_emoji : message.reaction_emoji || message.client_reaction_emoji;
              return (
                <div key={message.id || stableMessageKey(message)} onClick={() => forwardSelectionMode && toggleForwardSelection(message)} className={`group flex ${outbound ? 'justify-end' : 'justify-start'} ${forwardSelectionMode ? 'cursor-pointer' : ''}`}>
                  <div className={`relative max-w-[78%] rounded-2xl px-3 py-2 text-[12px] shadow-sm ${outbound ? 'rounded-tr-sm bg-[#dcf8c6] text-slate-900' : 'rounded-tl-sm border border-black/5 bg-white text-slate-900'} ${selectedForwardIds.has(String(message.id)) ? 'ring-2 ring-[#075e54] ring-offset-1' : ''}`}>
                    {forwardSelectionMode && (
                      <div className="absolute -left-7 top-2 z-30 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-white shadow">
                        <div className={`grid h-4 w-4 place-items-center rounded-full ${selectedForwardIds.has(String(message.id)) ? 'bg-[#075e54] text-white' : 'bg-slate-100 text-transparent'}`}>
                          <Check size={11} strokeWidth={3} />
                        </div>
                      </div>
                    )}
                    {!forwardSelectionMode && <div className={`absolute top-1 flex items-center gap-1 md:hidden md:group-hover:flex ${outbound ? '-left-[72px]' : '-right-[72px]'}`}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); startForwardSelection(message); }} className="grid h-6 w-6 place-items-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-50" title="Selecionar mensagens para encaminhar"><Forward size={12} /></button><button type="button" onClick={(event) => { event.stopPropagation(); void shareMessage(message); }} className="grid h-6 w-6 place-items-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-50" title="Compartilhar mensagem"><Share2 size={12} /></button>
                      <button type="button" onClick={() => setReactionOpenId(reactionOpenId === message.id ? null : String(message.id))} className="grid h-6 w-6 place-items-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-50" title="Reagir">
                        <Smile size={12} />
                      </button>
                      <div className="relative">
                        <button type="button" onClick={() => { setDeleteOpenId(deleteOpenId === String(message.id) ? null : String(message.id)); setReactionOpenId(null); }} className="grid h-6 w-6 place-items-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-50" title="Apagar mensagem">
                          <Trash2 size={12} />
                        </button>
                        {deleteOpenId === String(message.id) && (
                          <div className={`absolute top-7 z-40 w-48 overflow-hidden rounded-xl border border-[#e6dccb] bg-white py-1 text-left shadow-xl ${outbound ? 'right-0' : 'left-0'}`}>
                            <button type="button" className="block w-full px-3 py-2 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-50" onClick={() => void deleteMessage(String(message.id), 'for_me')}>Apagar para mim</button>
                            <button type="button" className="block w-full px-3 py-2 text-left text-[11px] font-bold text-red-700 hover:bg-red-50" onClick={() => void deleteMessage(String(message.id), 'for_everyone')}>Apagar para todos</button>
                            <div className="border-t border-slate-100 px-3 py-2 text-[9px] font-medium leading-4 text-slate-500">“Para todos” remove de todos os usuários do AdvOS. A Meta não oferece revogação remota pela Cloud API.</div>
                          </div>
                        )}
                      </div>
                    </div>}
                    {!forwardSelectionMode && reactionOpenId === message.id && (
                      <div className={`absolute top-[-36px] z-20 flex gap-1 rounded-full border border-[#e6dccb] bg-white px-2 py-1 shadow-lg ${outbound ? 'right-0' : 'left-0'}`}>
                        {reactionOptions.map((emoji) => (
                          <button key={emoji} type="button" className="grid h-7 w-7 place-items-center rounded-full text-base hover:bg-[#f0f2f5]" onClick={() => reactToMessage(message, emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}
                    {outbound && <div className="mb-1 max-w-full truncate text-[9px] font-black text-[#075e54]" title={senderNameForMessage(message)}>{senderNameForMessage(message)}</div>}
                    {message?.remote_deleted_at && <div className="mb-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800">Mensagem apagada pelo contato no WhatsApp · cópia preservada no AdvOS</div>}
                    {renderMessageBody(message)}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-bold text-slate-500">
                      {message.optimistic && <span>sincronizando</span>}
                      <span>{messageTime(message.created_at)}</span>
                      {outbound && <StatusTicks status={message.status} />}
                    </div>
                    {bubbleReaction && (
                      <div className={`absolute -bottom-3 ${outbound ? 'left-2' : 'right-2'} rounded-full border border-white bg-white px-1.5 py-0.5 text-sm shadow-sm`}>
                        {bubbleReaction}
                      </div>
                    )}
                    {message.status === 'failed' && (
                      <div className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[9px] font-bold normal-case text-red-700">
                        Falhou: {message.error_message || 'em primeira mensagem ou fora da janela de 24h, a Meta exige template oficial aprovado.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
        {(!isAtBottom || newMessagesBelow) && (
          <button type="button" onClick={() => scrollToBottom('smooth')} className="absolute bottom-4 right-5 z-10 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#075e54] shadow-lg ring-1 ring-black/10 transition hover:bg-[#f0f2f5]" title="Ir para as mensagens mais recentes">
            <ChevronDown size={14} />
            {newMessagesBelow ? 'Novas mensagens' : 'Ir para o fim'}
          </button>
        )}
      </div>

      {forwardSelectionMode && selectedForwardIds.size > 0 && forwardPickerOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Encaminhar mensagens">
          <div className="w-full max-w-md rounded-2xl border border-[#e6dccb] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-900">Encaminhar mensagens</h3><p className="text-[10px] text-slate-500">{selectedForwardIds.size} {selectedForwardIds.size === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'}.</p></div><button type="button" onClick={() => setForwardPickerOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" aria-label="Fechar"><X size={15}/></button></div>
            <select value={forwardTargetId === '__picker__' ? '' : forwardTargetId} onChange={(e) => setForwardTargetId(e.target.value)} className="input w-full">
              <option value="">Selecione uma conversa</option>
              {(forwardTargets || []).filter((item: any) => {
                const id = String(item?.id || item?.conversation_id || '');
                const phone = String(item?.phone || item?.clients?.whatsapp || item?.clients?.phone || '').trim();
                return id && id !== String(conversation?.id) && phone;
              }).map((item: any) => {
                const id = String(item?.id || item?.conversation_id || '');
                const phone = item?.phone || item?.clients?.whatsapp || item?.clients?.phone;
                const department = item?.department === 'financeiro_juridico' ? 'Financeiro/Jurídico' : 'Atendimento';
                const state = item?.closed_at ? 'Encerrada' : department;
                const lead = item?.lead ? ' · Lead' : '';
                return <option key={id} value={id}>{titleForForward(item)} · {phone} · {state}{lead}</option>;
              })}
            </select>
            <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setForwardPickerOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Cancelar</button><button type="button" disabled={!forwardTargetId || forwardSending} onClick={() => void forwardSelectedMessages()} className="rounded-xl bg-[#075e54] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{forwardSending ? 'Encaminhando...' : 'Encaminhar'}</button></div>
          </div>
        </div>
      )}

      {isClosed ? (
        <div className="shrink-0 border-t border-[#d7ded4] bg-[#f0f2f5] p-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-[11px] font-bold text-slate-600 shadow-sm">
            Atendimento encerrado. Reabra a conversa acima para enviar mensagens, mídias ou iniciar chamadas.
          </div>
        </div>
      ) : (
      <div className="shrink-0 border-t border-[#d7ded4] bg-[#f0f2f5] p-2.5">
        {file && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#d7ded4] bg-white px-3 py-2 text-xs shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={16} className="shrink-0 text-slate-600" />
              <div className="min-w-0">
                <b className="break-safe block text-slate-900 leading-tight">{file.name}</b>
                <span className="text-[10px] font-bold text-slate-500">{file.type || 'arquivo'} {file.name.toLowerCase().endsWith('.webp') ? '• será enviado como figurinha' : ''} {fileSizeLabel(file.size) ? `• ${fileSizeLabel(file.size)}` : ''}</span>
              </div>
            </div>
            <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-slate-100" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              <X size={14} />
            </button>
          </div>
        )}

        {recordedAudio && (
          <div className="mb-2 rounded-2xl border border-[#d7ded4] bg-white px-3 py-2 text-xs shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-black text-slate-800">
                <Mic size={15} className="text-[#075e54]" />
                Áudio gravado {recordedAudio.seconds ? `• ${recordedAudio.seconds}s` : ''}
              </div>
              <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-slate-100" onClick={clearRecordedAudio} title="Descartar áudio">
                <X size={14} />
              </button>
            </div>
            <audio controls preload="metadata" className="w-full" src={recordedAudio.url}>
              Seu navegador não suporta reprodução de áudio.
            </audio>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-slate-500">{recordedAudio.preparing ? 'Convertendo para MP3...' : recordedAudio.error ? recordedAudio.error : 'Áudio pronto em MP3. Escute antes de enviar.'}</span>
              <button type="button" onClick={() => sendRecordedAudio(recordedAudio.file)} disabled={sending || recordedAudio.preparing || !recordedAudio.ready} className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">
                <Send size={12} /> {recordedAudio.preparing ? 'Preparando' : 'Enviar áudio'}
              </button>
            </div>
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { setFile(event.target.files?.[0] || null); clearRecordedAudio(); }} />
          <div className="relative mb-1 shrink-0">
            <button type="button" className={`grid h-10 w-10 place-items-center rounded-full bg-white text-slate-600 shadow-sm transition hover:bg-[#fffaf2] ${attachOpen ? 'rotate-45' : ''}`} onClick={() => { setAttachOpen((value) => !value); setEmojiOpen(false); setStickerOpen(false); setShortcutOpen(false); }} title="Anexar ou enviar recurso">
              <Plus size={20} />
            </button>
            {attachOpen && (
              <div className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-52 overflow-hidden rounded-2xl border border-[#d7ded4] bg-white p-1.5 shadow-xl">
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => { setAttachOpen(false); fileInputRef.current?.click(); }}><Paperclip size={16} className="text-violet-600"/> Documento ou mídia</button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => { setAttachOpen(false); setSpecialKind('location'); }}><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-[11px]">📍</span> Localização</button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => { setAttachOpen(false); setSpecialKind('poll'); }}><span className="grid h-5 w-5 place-items-center rounded-full bg-blue-100 text-[11px]">📊</span> Enquete</button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50" onClick={() => { setAttachOpen(false); setSpecialKind('event'); }}><span className="grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-[11px]">📅</span> Evento</button>
              </div>
            )}
          </div>
          <button type="button" className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-[#fffaf2]" onClick={() => { setEmojiOpen((v) => !v); setStickerOpen(false); setShortcutOpen(false); }} title="Emojis">
            <Laugh size={18} />
          </button>
          <button type="button" className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-[#fffaf2]" onClick={() => { setStickerOpen((v) => !v); setEmojiOpen(false); setShortcutOpen(false); }} title="Figurinhas rápidas">
            <Sparkles size={18} />
          </button>

          <div className="relative flex-1">
            <textarea ref={textareaRef} className="input min-h-[44px] resize-y rounded-[20px] border-transparent bg-white px-4 py-3 text-xs shadow-sm focus:border-[#25D366]" value={text} onChange={(event) => { const value = event.target.value; setText(value); setShortcutOpen(value.trimStart().startsWith('/')); setEmojiOpen(false); setStickerOpen(false); }} onFocus={() => { setShortcutOpen(text.trimStart().startsWith('/')); refreshThreadMessages(true); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(); } if (event.key === 'Escape') { setShortcutOpen(false); setEmojiOpen(false); setStickerOpen(false); setAttachOpen(false); } }} placeholder={recordedAudio ? 'Escute o áudio e clique em enviar.' : file ? 'Legenda opcional. Ctrl + Enter envia.' : 'Mensagem ou / para modelo. Ctrl + Enter envia.'} />

            {shortcutOpen && slashTerm !== null && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 max-h-80 w-full overflow-auto rounded-2xl border border-[#d7ded4] bg-white p-2 shadow-xl">
                <div className="mb-1 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Modelos rápidos</div>
                {shortcutSuggestions.length ? shortcutSuggestions.map((template) => (
                  <button key={template.id} type="button" className="flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-[#f0f2f5]" onMouseDown={(event) => event.preventDefault()} onClick={() => insertTemplate(template)}>
                    <span className="min-w-0">
                      <b className="block truncate text-xs text-slate-950">{template.name}</b>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">/{template.normalizedShortcut} • {template.category || 'geral'}</span>
                    </span>
                    <span className="rounded-full bg-[#e9edef] px-2 py-1 text-[10px] font-black text-slate-600">Usar</span>
                  </button>
                )) : (
                  <div className="px-2 py-3 text-xs font-bold text-slate-500">
                    Nenhum modelo encontrado. Cadastre modelos em <b>Modelos de mensagem</b> e use atalhos como <b>/cobranca</b>.
                  </div>
                )}
              </div>
            )}

            {emojiOpen && (
              <div className="whatsapp-emoji-picker absolute bottom-[calc(100%+8px)] left-0 z-20 grid w-[310px] grid-cols-10 gap-1 rounded-2xl border border-[#d7ded4] bg-white p-2 shadow-xl">
                {emojiOptions.map((emoji) => <button key={emoji} type="button" className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-[#f0f2f5]" onClick={() => appendToText(emoji)}>{emoji}</button>)}
              </div>
            )}

            {stickerOpen && (
              <div className="whatsapp-sticker-picker absolute bottom-[calc(100%+8px)] left-0 z-20 w-[310px] rounded-2xl border border-[#d7ded4] bg-white p-2 shadow-xl">
                <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Figurinhas rápidas</div>
                <div className="grid grid-cols-4 gap-2">
                  {quickStickers.map((emoji) => <button key={emoji} type="button" className="grid h-14 place-items-center rounded-xl bg-[#f0f2f5] text-3xl hover:bg-[#e2e8f0]" onClick={() => { appendToText(emoji); setStickerOpen(false); }}>{emoji}</button>)}
                </div>
                <p className="mt-2 px-2 text-[10px] font-bold text-slate-500">Para figurinha real, envie um arquivo .webp pelo clipe.</p>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${recording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-slate-600 hover:bg-[#fffaf2]'}`}
            onClick={recording ? stopRecording : startRecording}
            disabled={sending || Boolean(file) || Boolean(recordedAudio)}
            title={recording ? 'Parar gravação e escutar' : recordedAudio ? 'Apague o áudio gravado para gravar outro' : 'Gravar áudio'}
          >
            {recording ? <Square size={15} /> : <Mic size={18} />}
          </button>

          <button className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:bg-[#1ebe5d] disabled:cursor-not-allowed disabled:opacity-50" onClick={send} disabled={sending || recording || Boolean(recordedAudio?.preparing) || (!text.trim() && !file && !recordedAudio)} title="Enviar">
            <Send size={17} />
          </button>
        </div>

        {previewTemplate && text.trim().startsWith('/') && (
          <div className="mt-2 rounded-xl border border-[#d7ded4] bg-white px-3 py-2 text-[11px] text-slate-600">
            <b>Atalho encontrado:</b> {previewTemplate.name}. Se enviar <code>/{previewTemplate.normalizedShortcut}</code>, o AdvOS substituirá pelo modelo salvo.
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shortcuts.slice(0, 10).map((template) => (
              <button key={template.id} type="button" className="rounded-full border border-[#d7ded4] bg-white px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-[#fffaf2]" onClick={() => insertTemplate(template)} title={template.name}>
                /{template.normalizedShortcut}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 min-h-[16px]">
          {recording ? <p className="break-safe text-[10px] font-black leading-relaxed text-red-600">Gravando áudio... {recordingSeconds}s — clique no botão vermelho para parar e escutar.</p> : feedback ? <p className="break-safe text-[10px] font-bold leading-relaxed text-slate-600">{feedback}</p> : <p className="break-safe text-[10px] leading-relaxed text-slate-500">Digite / para listar modelos. Use 😊 para emojis, ✨ para figurinhas, clipe para documentos ou microfone para gravar áudio.</p>}
        </div>
      </div>
      )}

      {!isClosed && specialKind && (
        <WhatsappSpecialComposer
          kind={specialKind}
          conversation={conversation}
          onClose={() => setSpecialKind(null)}
          onSent={(conversationId) => { onSent?.(conversationId || conversation?.id); window.setTimeout(() => refreshThreadMessages(true), 250); }}
        />
      )}
      {!isClosed && callMode && <WhatsappCallPanel conversation={conversation} mode={callMode} onClose={() => setCallMode(null)} />}
    </div>
  );
}
