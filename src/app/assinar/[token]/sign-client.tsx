'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eye, FileCheck2, Loader2, Send, ShieldCheck } from 'lucide-react';

type Props = {
  token: string;
  requestId: string;
  signerId: string;
  title: string;
  signer: any;
  settings: { requireSelfie: boolean; requireDocumentPhoto: boolean; requireOtp: boolean };
  status: string;
};

type Step = 'preview' | 'identity' | 'confirm' | 'done';

export default function SignClient({ token, requestId, signerId, title, signer, settings, status }: Props) {
  const [step, setStep] = useState<Step>(status === 'assinado' ? 'done' : 'preview');
  const [viewConfirmed, setViewConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [otp, setOtp] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const startCamera = async () => {
    setMessage('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setStream(media);
      if (videoRef.current) videoRef.current.srcObject = media;
    } catch {
      setMessage('Não foi possível acessar a câmera. Autorize a câmera para continuar.');
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && setSelfie(blob), 'image/jpeg', 0.88);
  };

  const markViewed = async () => {
    if (!consent) {
      setMessage('Confirme que visualizou o documento completo.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/signatures/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, requestId, signerId }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível registrar a visualização.');
      setViewConfirmed(true);
      setConsent(false);
      setStep('identity');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível registrar a visualização.');
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setSendingOtp(true);
    setMessage('');
    try {
      const response = await fetch('/api/signatures/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, requestId, signerId }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível enviar o código.');
      setMessage('Código de segurança enviado pelo WhatsApp.');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível enviar o código.');
    } finally {
      setSendingOtp(false);
    }
  };

  const continueIdentity = () => {
    if (!settings.requireSelfie || selfie) {
      setStep('confirm');
      return;
    }
    setMessage('Capture a selfie para continuar.');
  };

  const sign = async () => {
    if (!viewConfirmed) {
      setMessage('Visualize o documento antes de assinar.');
      return;
    }
    if (!consent) {
      setMessage('Confirme que leu e concorda com o documento.');
      return;
    }
    if (settings.requireSelfie && !selfie) {
      setMessage('Capture a selfie antes de assinar.');
      return;
    }
    if (settings.requireOtp && !otp) {
      setMessage('Informe o código de segurança enviado por WhatsApp.');
      return;
    }
    if (nameConfirm.trim().toLowerCase() !== String(signer?.name || '').trim().toLowerCase()) {
      setMessage('Confirme seu nome completo exatamente como aparece no documento.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (settings.requireSelfie && selfie) {
        const selfieForm = new FormData();
        selfieForm.append('token', token);
        selfieForm.append('requestId', requestId);
        selfieForm.append('signerId', signerId);
        selfieForm.append('selfie', selfie, 'selfie.jpg');
        const selfieResponse = await fetch('/api/signatures/selfie', { method: 'POST', body: selfieForm });
        const selfieJson = await selfieResponse.json();
        if (!selfieResponse.ok || !selfieJson.ok) throw new Error(selfieJson.error || 'Não foi possível salvar a selfie.');
      }
      const form = new FormData();
      form.append('token', token);
      form.append('requestId', requestId);
      form.append('signerId', signerId);
      form.append('otp', otp);
      form.append('confirmation_name', nameConfirm.trim());
      const response = await fetch('/api/signatures/sign', { method: 'POST', body: form });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível concluir a assinatura.');
      setStep('done');
      stream?.getTracks().forEach((track) => track.stop());
      setMessage('Sua assinatura foi registrada.');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível concluir a assinatura.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <main className="min-h-screen bg-[#f6f7f9] p-4 md:p-8">
        <section className="mx-auto max-w-2xl rounded-3xl bg-white p-10 text-center shadow-sm">
          <CheckCircle2 className="mx-auto text-emerald-600" size={60} />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Assinatura registrada</h1>
          <p className="mt-2 text-sm text-slate-600">O documento foi recebido pelo escritório e seguirá para a próxima etapa.</p>
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-left text-sm font-semibold text-emerald-900">
            Depois da sua assinatura, o processo seguirá internamente para o escritório.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-center gap-3 rounded-3xl bg-white p-5 shadow-sm">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#075e54] text-white"><ShieldCheck size={22} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ladeira Advogados · Assinatura eletrônica</p>
            <h1 className="text-xl font-black text-slate-950">Assinatura eletrônica</h1>
          </div>
        </header>

        {message && <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">{message}</div>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Documento para assinatura</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
            </div>
            <div className="h-[68vh] min-h-[520px] bg-slate-100">
              <iframe title="Visualização do documento" src={`/api/public/signatures/${token}/document`} className="h-full w-full border-0" />
            </div>
          </section>

          <aside className="rounded-3xl bg-white p-5 shadow-sm">
            {step === 'preview' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 font-black text-emerald-950"><Eye size={17} /> 1. Visualize o documento</div>
                  <p className="mt-2 text-xs font-semibold text-emerald-900">Leia o documento completo no painel ao lado. A assinatura somente será liberada depois dessa etapa.</p>
                </div>
                <label className="flex items-start gap-2 rounded-2xl border p-4 text-xs font-semibold">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  Confirmo que visualizei o documento completo.
                </label>
                <button onClick={markViewed} disabled={!consent || busy} className="btn btn-primary w-full">
                  {busy ? <Loader2 className="animate-spin" /> : <FileCheck2 size={16} />} Continuar
                </button>
              </div>
            )}

            {step === 'identity' && (
              <div className="space-y-4">
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 font-black"><Camera size={17} /> 2. Confirme sua identidade</div>
                  <p className="mt-1 text-xs text-slate-500">A selfie é usada como evidência do processo de assinatura.</p>
                  {settings.requireSelfie && (
                    <>
                      <video ref={videoRef} id="advos-sign-camera" autoPlay playsInline className="mt-3 aspect-video w-full rounded-2xl bg-slate-900 object-cover" />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button className="btn btn-secondary" onClick={startCamera}>Abrir câmera</button>
                        <button className="btn btn-primary" onClick={captureSelfie}>Capturar selfie</button>
                      </div>
                      {selfie && <p className="mt-2 text-xs font-black text-emerald-700">Selfie capturada ✓</p>}
                    </>
                  )}
                </div>
                <button onClick={continueIdentity} disabled={settings.requireSelfie && !selfie} className="btn btn-primary w-full">Continuar</button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-2xl border p-4">
                  <p className="text-sm font-black">3. Assinatura eletrônica</p>
                  <p className="mt-1 text-xs text-slate-500">Não é necessário desenhar uma assinatura.</p>
                  {settings.requireOtp && (
                    <div className="mt-4">
                      <label className="label">Código de segurança</label>
                      <div className="mt-1 flex gap-2">
                        <input className="input flex-1" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 dígitos" />
                        <button className="btn btn-secondary" onClick={sendOtp} disabled={sendingOtp}>{sendingOtp ? 'Enviando…' : <Send size={15} />}</button>
                      </div>
                    </div>
                  )}
                  <label className="label mt-4">Nome completo</label>
                  <input className="input mt-1" value={nameConfirm} onChange={(e) => setNameConfirm(e.target.value)} placeholder={String(signer?.name || '')} />
                  <label className="mt-3 flex items-start gap-2 rounded-2xl border p-4 text-xs font-semibold">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                    Li e concordo com o documento e com a assinatura eletrônica.
                  </label>
                </div>
                <button onClick={sign} disabled={busy || !consent} className="btn btn-primary w-full">
                  {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={16} />} Assinar documento
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
