'use client';

import { useState } from 'react';
import { CalendarDays, Check, Loader2, MapPin, Send, Vote, X } from 'lucide-react';

export type WhatsappSpecialKind = 'location' | 'poll' | 'event';

export function WhatsappSpecialComposer({ kind, conversation, onClose, onSent }: {
  kind: WhatsappSpecialKind;
  conversation: any;
  onClose: () => void;
  onSent?: (conversationId?: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const title = kind === 'location' ? 'Enviar localização' : kind === 'poll' ? 'Criar enquete' : 'Criar evento';
  const Icon = kind === 'location' ? MapPin : kind === 'poll' ? Vote : CalendarDays;

  function useCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Este navegador não oferece geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
      },
      () => setError('Não foi possível obter a localização. Verifique a permissão do navegador.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  async function submit() {
    setSending(true);
    setError('');
    try {
      let data: any = {};
      if (kind === 'location') {
        data = { latitude: Number(latitude), longitude: Number(longitude), name: locationName.trim(), address: address.trim() };
      } else if (kind === 'poll') {
        data = { question: question.trim(), options: options.map((value) => value.trim()).filter(Boolean) };
      } else {
        data = { title: eventTitle.trim(), date: eventDate, time: eventTime, location: eventLocation.trim(), notes: eventNotes.trim() };
      }
      const response = await fetch('/api/whatsapp/special', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, phone: conversation?.phone, clientId: conversation?.client_id || null, data }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Não foi possível enviar.');
      onSent?.(result?.conversationId || conversation?.id);
      window.dispatchEvent(new Event('advos:whatsapp-refresh'));
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-slate-950/30 p-3 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e7f7ef] text-[#075e54]"><Icon size={17} /></div>
            <div><h3 className="text-sm font-black text-slate-950">{title}</h3><p className="text-[10px] font-semibold text-slate-500">{conversation?.clients?.name || conversation?.lead_name || conversation?.phone}</p></div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100"><X size={15}/></button>
        </div>

        <div className="space-y-3 p-4">
          {kind === 'location' && <>
            <button type="button" onClick={useCurrentLocation} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e7f7ef] px-3 py-2.5 text-xs font-black text-[#075e54]"><MapPin size={15}/> Usar minha localização atual</button>
            <div className="grid grid-cols-2 gap-2"><input className="input" value={latitude} onChange={(e)=>setLatitude(e.target.value)} placeholder="Latitude" inputMode="decimal"/><input className="input" value={longitude} onChange={(e)=>setLongitude(e.target.value)} placeholder="Longitude" inputMode="decimal"/></div>
            <input className="input" value={locationName} onChange={(e)=>setLocationName(e.target.value)} placeholder="Nome do local (opcional)"/>
            <input className="input" value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Endereço (opcional)"/>
            <p className="text-[10px] font-semibold leading-relaxed text-slate-500">O cliente receberá um cartão de localização nativo do WhatsApp.</p>
          </>}

          {kind === 'poll' && <>
            <textarea className="input min-h-[84px] resize-none" value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Pergunta da enquete"/>
            {options.map((option, index) => <div key={index} className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">{index+1}</span><input className="input" value={option} onChange={(e)=>setOptions((current)=>current.map((item,i)=>i===index?e.target.value:item))} placeholder={`Opção ${index+1}`} maxLength={20}/></div>)}
            {options.length < 3 && <button type="button" onClick={()=>setOptions((current)=>[...current,''])} className="text-xs font-black text-[#075e54]">+ Adicionar terceira opção</button>}
            <p className="text-[10px] font-semibold leading-relaxed text-slate-500">A Cloud API não expõe a enquete nativa do app; o AdvOS envia opções como botões interativos oficiais do WhatsApp.</p>
          </>}

          {kind === 'event' && <>
            <input className="input" value={eventTitle} onChange={(e)=>setEventTitle(e.target.value)} placeholder="Nome do evento"/>
            <div className="grid grid-cols-2 gap-2"><input type="date" className="input" value={eventDate} onChange={(e)=>setEventDate(e.target.value)}/><input type="time" className="input" value={eventTime} onChange={(e)=>setEventTime(e.target.value)}/></div>
            <input className="input" value={eventLocation} onChange={(e)=>setEventLocation(e.target.value)} placeholder="Local (opcional)"/>
            <textarea className="input min-h-[70px] resize-none" value={eventNotes} onChange={(e)=>setEventNotes(e.target.value)} placeholder="Observações (opcional)"/>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-relaxed text-slate-600">O cliente receberá <b>Confirmar</b>, <b>Talvez</b> e <b>Não posso</b> como respostas rápidas.</div>
          </>}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={submit} disabled={sending} className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{sending ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Enviar</button>
        </div>
      </div>
    </div>
  );
}
