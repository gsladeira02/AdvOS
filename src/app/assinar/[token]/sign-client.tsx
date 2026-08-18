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

type Step = 'preview' | 'camera' | 'confirm' | 'done';

export default function SignClient({ token, requestId, signerId, title, signer, settings, status }: Props) {
  const [step, setStep] = useState<Step>(status === 'assinado' ? 'done' : 'preview');
  const [viewConfirmed, setViewConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [otp, setOtp] = useState('');
  const [nameConfirm, setNameConfirm] = useState('');
  const [cpfConfirm, setCpfConfirm] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [validatingSelfie, setValidatingSelfie] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { stream?.getTracks().forEach((track) => track.stop()); if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl); }, [stream, selfiePreviewUrl]);

  useEffect(() => {
    if (!cameraOpen || !stream || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = stream;
    video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraOpen, stream]);

  const startCamera = async () => {
    setMessage('');
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        fileInputRef.current?.click();
        return;
      }
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      setStream(media);
      setCameraOpen(true);
    } catch (error: any) {
      // Em dispositivos/navegadores que não permitem câmera web, abre a câmera nativa via input capture.
      if (fileInputRef.current) fileInputRef.current.click();
      else setMessage('Não foi possível acessar a câmera. Autorize a câmera para continuar.');
    }
  };

  const validateFace = async (image: Blob) => {
    const bitmap = await createImageBitmap(image);
    try {
      const FaceDetectorCtor = typeof window !== 'undefined' ? (window as any).FaceDetector : null;
      if (FaceDetectorCtor) {
        const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 3 });
        const faces = await detector.detect(bitmap);
        if (faces.length === 0) throw new Error('Não foi possível detectar um rosto na selfie. Tire uma nova foto mostrando seu rosto inteiro.');
        if (faces.length > 1) throw new Error('Foi detectado mais de um rosto na selfie. Tire uma nova foto somente com você.');
        return true;
      }

      // Fallback multiplataforma para navegadores que não implementam a Shape Detection API.
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
      const detector = await FaceDetector.createFromModelPath(
        vision,
        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
      );
      const result = detector.detect(bitmap);
      const faces = result.detections || [];
      if (faces.length === 0) throw new Error('Não foi possível detectar um rosto na selfie. Tire uma nova foto mostrando seu rosto inteiro.');
      if (faces.length > 1) throw new Error('Foi detectado mais de um rosto na selfie. Tire uma nova foto somente com você.');
      return true;
    } finally {
      bitmap.close();
    }
  };

  const acceptSelfie = async (image: Blob) => {
    setValidatingSelfie(true);
    setMessage('');
    try {
      await validateFace(image);
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      setSelfie(image);
      setSelfiePreviewUrl(URL.createObjectURL(image));
      stream?.getTracks().forEach((track) => track.stop());
      setStream(null);
      setCameraOpen(false);
      setMessage('Selfie capturada ✓');
    } catch (error: any) {
      setSelfie(null);
      if (selfiePreviewUrl) { URL.revokeObjectURL(selfiePreviewUrl); setSelfiePreviewUrl(null); }
      setMessage(error?.message || 'Não foi possível validar a selfie.');
    } finally {
      setValidatingSelfie(false);
    }
  };

  const handleCameraFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await acceptSelfie(file);
    event.target.value = '';
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!cameraOpen || !stream) { setMessage('Abra a câmera antes de capturar a selfie.'); return; }
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      void acceptSelfie(blob);
    }, 'image/jpeg', 0.88);
  };

  const markViewed = async () => {
    if (!nameConfirm.trim()) { setMessage('Informe seu nome completo.'); return; }
    const cpfDigits = normalizeCpf(cpfConfirm);
    if (cpfDigits.length !== 11) { setMessage('Informe um CPF válido com 11 dígitos.'); return; }
    if (!consent) { setMessage('Confirme que visualizou o documento completo.'); return; }
    const storedCpf = normalizeCpf(String(signer?.cpf || ''));
    if (storedCpf && storedCpf !== cpfDigits) { setMessage('O CPF informado não confere com o cadastro do cliente.'); return; }
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
      setStep(settings.requireSelfie ? 'camera' : 'confirm');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível registrar a visualização.');
    } finally {
      setBusy(false);
    }
  };

  const continueIdentity = async () => {
    if (settings.requireSelfie && !selfie) {
      setMessage('Capture a selfie antes de continuar.');
      return;
    }
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
    setMessage('');
    setStep('confirm');
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
      setOtpSent(true);
      setMessage('Token enviado. Digite o código recebido e continue.');
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível enviar o código.');
    } finally {
      setSendingOtp(false);
    }
  };


  const normalizeCpf = (v:string) => v.replace(/\D/g,'').slice(0,11);
  const formatCpf = (v:string) => { const d=normalizeCpf(v); if(d.length<=3) return d; if(d.length<=6) return `${d.slice(0,3)}.${d.slice(3)}`; if(d.length<=9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`; return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`; };


  const sign = async () => {
    const cpfDigits = normalizeCpf(cpfConfirm);
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
    if (settings.requireOtp && !otpSent) { setMessage('Clique em “Receber token por WhatsApp” para receber o código.'); return; }
    if (settings.requireOtp && !otp) { setMessage('Informe o código de segurança enviado por WhatsApp.'); return; }
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
        selfieForm.append('cpf', cpfDigits);
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
      form.append('cpf', cpfDigits);
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
                <div className="rounded-2xl border p-4">
                  <p className="text-sm font-black">2. Seus dados</p>
                  <label className="label mt-4">Nome completo</label>
                  <input className="input mt-1" value={nameConfirm} onChange={(e)=>setNameConfirm(e.target.value)} placeholder="Digite seu nome completo" autoComplete="name" />
                  <label className="label mt-4">CPF</label>
                  <input inputMode="numeric" className="input mt-1" value={formatCpf(cpfConfirm)} onChange={(e)=>setCpfConfirm(normalizeCpf(e.target.value))} placeholder="Digite seu CPF" autoComplete="off" />
                </div>
                <label className="flex items-start gap-2 rounded-2xl border p-4 text-xs font-semibold">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  Confirmo que visualizei o documento completo.
                </label>
                <button onClick={markViewed} disabled={!consent || !nameConfirm.trim() || normalizeCpf(cpfConfirm).length!==11 || busy} className="btn btn-primary w-full">
                  {busy ? <Loader2 className="animate-spin" /> : <FileCheck2 size={16} />} Continuar
                </button>
              </div>
            )}

            {step === 'camera' && (
              <div className="space-y-4">
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 font-black"><Camera size={17} /> 2. Selfie de segurança</div>
                  <p className="mt-1 text-xs text-slate-500">Abra a câmera primeiro. O botão para capturar a selfie aparece somente depois que a câmera estiver ativa.</p>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={handleCameraFile} className="hidden" aria-hidden="true" />
                  {!cameraOpen && <button type="button" className="btn btn-primary mt-4 w-full" onClick={startCamera}><Camera size={16}/> Abrir câmera</button>}
                  {selfie && selfiePreviewUrl ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <img src={selfiePreviewUrl} alt="Selfie capturada" className="mx-auto aspect-square w-full max-w-sm rounded-2xl object-cover" />
                      <p className="mt-3 text-center text-xs font-black text-emerald-700">Selfie capturada ✓</p>
                    </div>
                  ) : cameraOpen ? (
                    <>
                      <video ref={videoRef} id="advos-sign-camera" autoPlay playsInline className="mt-3 aspect-video w-full rounded-2xl bg-slate-900 object-cover" />
                      <button type="button" className="btn btn-primary mt-3 w-full" onClick={captureSelfie} disabled={validatingSelfie}><Camera size={16}/> {validatingSelfie ? 'Validando selfie...' : 'Capturar selfie'}</button>
                    </>
                  ) : null}
                </div>
                <button type="button" onClick={continueIdentity} disabled={settings.requireSelfie && !selfie} className="btn btn-primary w-full">Continuar</button>
              </div>
            )}


            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-2xl border p-4">
                  <p className="text-sm font-black">4. Assinatura eletrônica</p>
                                    {settings.requireOtp && (
                    <div className="mt-4">
                      <label className="label">Código de segurança</label>
                      <div className="mt-1 flex gap-2">
                        <input disabled={!otpSent} className="input flex-1" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 dígitos" />
                        <button type="button" className="btn btn-secondary" onClick={sendOtp} disabled={sendingOtp}>{sendingOtp ? 'Enviando…' : 'Receber token por WhatsApp'}</button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                    Nome: {nameConfirm || '—'}<br/>CPF: {formatCpf(cpfConfirm) || '—'}
                  </div>
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
