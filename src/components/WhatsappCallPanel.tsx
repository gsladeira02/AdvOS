'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Phone, PhoneOff, ShieldCheck, Video, VideoOff, X } from 'lucide-react';

type CallMode = 'voice' | 'video';

function permissionGranted(payload: any) {
  const text = JSON.stringify(payload || {}).toLowerCase();
  return text.includes('"granted"') || text.includes('"start_call"');
}

async function waitForIce(pc: RTCPeerConnection, timeoutMs = 4500) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    const listener = () => {
      if (pc.iceGatheringState === 'complete') { cleanup(); resolve(); }
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', listener);
    };
    pc.addEventListener('icegatheringstatechange', listener);
  });
}

export function WhatsappCallPanel({ conversation, mode, onClose }: { conversation: any; mode: CallMode; onClose: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'permission' | 'ready' | 'calling' | 'connected' | 'ended' | 'error'>('checking');
  const [message, setMessage] = useState('Verificando disponibilidade da Calling API...');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callId, setCallId] = useState('');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pollingRef = useRef<number | null>(null);

  const phone = String(conversation?.phone || '');
  const phoneDigits = phone.replace(/\D/g, '');
  const name = conversation?.clients?.name || conversation?.lead_name || phone || 'Contato';

  function cleanupMedia() {
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/whatsapp/calls?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !result?.ok || !result.callingAvailable) {
          setPhase('error');
          setMessage(result?.error || 'A Calling API ainda não está habilitada para este número na Meta.');
          return;
        }
        if (!permissionGranted(result.permission)) {
          setPhase('permission');
          setMessage('O cliente ainda precisa autorizar chamadas iniciadas pelo escritório no WhatsApp.');
          return;
        }
        setPhase('ready');
        setMessage(mode === 'video' ? 'Permissão disponível. Inicie a videochamada.' : 'Permissão disponível. Inicie a ligação.');
      } catch (error: any) {
        if (!cancelled) { setPhase('error'); setMessage(error?.message || 'Não foi possível consultar a Calling API.'); }
      }
    })();
    return () => { cancelled = true; cleanupMedia(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, mode]);

  async function requestPermission() {
    try {
      setMessage('Enviando pedido de autorização...');
      const response = await fetch('/api/whatsapp/special', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'call_permission', phone, clientId: conversation?.client_id || null, data: { body: 'Podemos ligar para você pelo WhatsApp para tratar deste atendimento?' } }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível solicitar autorização.');
      setMessage('Solicitação enviada ao cliente. Quando ele autorizar, abra novamente a chamada.');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao solicitar autorização.');
    }
  }

  async function startCall() {
    try {
      setPhase('calling');
      setMessage(mode === 'video' ? 'Preparando videochamada...' : 'Preparando ligação...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      localStreamRef.current = stream;
      if (localVideoRef.current && mode === 'video') localVideoRef.current.srcObject = stream;

      const stunUrl = String(process.env.NEXT_PUBLIC_WEBRTC_STUN_URL || '').trim();
      const pc = new RTCPeerConnection(stunUrl ? { iceServers: [{ urls: stunUrl }] } : undefined);
      pcRef.current = pc;
      const remote = new MediaStream();
      remoteStreamRef.current = remote;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        event.streams?.[0]?.getTracks().forEach((track) => {
          if (!remote.getTracks().some((current) => current.id === track.id)) remote.addTrack(track);
        });
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { setPhase('connected'); setMessage('Chamada conectada.'); }
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && phase !== 'ended') setMessage(`Estado da chamada: ${pc.connectionState}.`);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const sdp = pc.localDescription?.sdp || offer.sdp || '';
      const correlationId = `advos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const response = await fetch('/api/whatsapp/calls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', phone, sdp, correlationId, video: mode === 'video' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'A Meta recusou a chamada.');
      const newCallId = String(result.callId || '');
      setCallId(newCallId);
      setMessage('Chamando no WhatsApp...');

      const started = Date.now();
      pollingRef.current = window.setInterval(async () => {
        if (Date.now() - started > 45000) {
          if (pollingRef.current) window.clearInterval(pollingRef.current);
          pollingRef.current = null;
          setMessage('A chamada não conectou dentro do tempo esperado.');
          return;
        }
        try {
          const params = new URLSearchParams({ correlationId });
          if (newCallId) params.set('callId', newCallId);
          const poll = await fetch(`/api/whatsapp/calls?${params.toString()}`, { cache: 'no-store' });
          const data = await poll.json().catch(() => ({}));
          const call = data?.call;
          if (!call) return;
          if (call?.id && !newCallId) setCallId(String(call.id));
          const event = String(call?.event || call?.status || '').toLowerCase();
          const remoteSdp = call?.session?.sdp;
          if (remoteSdp && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription({ type: 'answer', sdp: String(remoteSdp) });
            setPhase('connected');
            setMessage('Chamada conectada.');
          }
          if (event.includes('terminate') || event.includes('rejected') || event.includes('failed')) {
            setPhase('ended');
            setMessage(event.includes('rejected') ? 'Chamada recusada.' : 'Chamada encerrada.');
            cleanupMedia();
          }
        } catch {}
      }, 700);
    } catch (error: any) {
      cleanupMedia();
      setPhase('error');
      setMessage(error?.message || 'Não foi possível iniciar a chamada.');
    }
  }

  async function hangup() {
    try {
      const id = callId;
      if (id) await fetch('/api/whatsapp/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'terminate', callId: id }) });
    } catch {}
    cleanupMedia();
    setPhase('ended');
    setMessage('Chamada encerrada.');
  }

  function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  function toggleCamera() {
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl">
        <button type="button" onClick={() => { void hangup(); onClose(); }} className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" title="Fechar"><X size={17} /></button>
        <div className="p-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[#075e54] text-2xl font-black">{String(name).split(' ').filter(Boolean).slice(0,2).map((part:string)=>part[0]).join('').toUpperCase()}</div>
          <h3 className="text-lg font-black">{name}</h3>
          <p className="mt-1 text-xs text-white/60">{mode === 'video' ? 'Videochamada pelo WhatsApp' : 'Ligação pelo WhatsApp'}</p>
          <p className="mx-auto mt-3 max-w-md text-xs font-semibold leading-relaxed text-white/75">{message}</p>
        </div>

        {mode === 'video' && (phase === 'calling' || phase === 'connected') && (
          <div className="relative mx-4 mb-4 aspect-video overflow-hidden rounded-2xl bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-3 right-3 h-28 w-20 rounded-xl border border-white/20 bg-slate-900 object-cover shadow-xl" />
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay />

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-5">
          {phase === 'checking' && <Loader2 className="animate-spin" size={22} />}
          {phase === 'permission' && <button type="button" onClick={requestPermission} className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-xs font-black text-white"><ShieldCheck size={16} /> Solicitar permissão</button>}
          {phase === 'ready' && <button type="button" onClick={startCall} className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-xs font-black text-white">{mode === 'video' ? <Video size={17}/> : <Phone size={17}/>} Iniciar</button>}
          {(phase === 'calling' || phase === 'connected') && <>
            <button type="button" onClick={toggleMute} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" title={muted ? 'Ativar microfone' : 'Silenciar'}>{muted ? <MicOff size={19}/> : <Mic size={19}/>}</button>
            {mode === 'video' && <button type="button" onClick={toggleCamera} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:bg-white/20" title={cameraOff ? 'Ativar câmera' : 'Desligar câmera'}>{cameraOff ? <VideoOff size={19}/> : <Video size={19}/>}</button>}
            <button type="button" onClick={hangup} className="grid h-12 w-12 place-items-center rounded-full bg-red-500 hover:bg-red-600" title="Encerrar"><PhoneOff size={20}/></button>
          </>}
          {(phase === 'error' || phase === 'ended') && <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-5 py-2.5 text-xs font-black hover:bg-white/20">Fechar</button>}
          {mode === 'voice' && phoneDigits && !['calling','connected'].includes(phase) && <a href={`tel:+${phoneDigits}`} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-black hover:bg-white/20"><Phone size={15}/> Ligação telefônica</a>}
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-center text-[10px] font-semibold text-white/45">Chamadas dependem de habilitação da WhatsApp Business Calling API, permissão do cliente e configuração de WebRTC da rede.</div>
      </div>
    </div>
  );
}
