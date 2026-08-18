'use client';
import {useEffect,useState} from 'react';
import {CheckCircle2,Eye,Loader2,RefreshCw,ShieldCheck} from 'lucide-react';

export default function InternalSignClient({requestId,signerId,title,status,signer}:{requestId:string,signerId:string,title:string,status:string,signer:any}){
 const previewUrl=`/api/app/documents/${requestId}/preview`;
 const [previewState,setPreviewState]=useState<'loading'|'ready'|'error'>('loading');
 const [viewed,setViewed]=useState(false);
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [previewBlobUrl,setPreviewBlobUrl]=useState('');
 const [done,setDone]=useState(status==='assinado');

 const checkPreview=async()=>{
   setPreviewState('loading');
   setMessage('');
   try{
     const response=await fetch(`${previewUrl}?check=${Date.now()}`,{method:'GET',cache:'no-store',credentials:'same-origin'});
     const contentType=String(response.headers.get('content-type')||'').toLowerCase();
     if(!response.ok||!contentType.includes('application/pdf')) throw new Error('O documento não pôde ser carregado.');
     const blob=await response.blob();
     const nextUrl=URL.createObjectURL(blob);
     setPreviewBlobUrl(prev=>{ if(prev) URL.revokeObjectURL(prev); return nextUrl; });
     setPreviewState('ready');
   }catch(e:any){
     setPreviewState('error');
     setMessage(e?.message||'Não foi possível carregar o documento.');
   }
 };

 useEffect(()=>{checkPreview();},[requestId]);
 useEffect(()=>()=>{ if(previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); },[previewBlobUrl]);

 const view=async()=>{
   if(previewState!=='ready'){setMessage('Aguarde o carregamento do documento antes de confirmar a visualização.');return}
   setBusy(true);setMessage('');
   try{
     const r=await fetch('/api/signatures/internal-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,signerId})});
     const j=await r.json();
     if(!r.ok||!j.ok)throw new Error(j.error||'Não foi possível registrar a visualização.');
     setViewed(true);
   }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 };

 const sign=async()=>{
   if(previewState!=='ready'){setMessage('O documento precisa estar carregado para ser assinado.');return}
   if(!viewed){setMessage('Visualize o documento antes de assinar.');return}
   if(!consent){setMessage('Confirme que leu e concorda com o documento.');return}
   setBusy(true);setMessage('');
   try{
     const fd=new FormData();
     fd.append('requestId',requestId);
     fd.append('signerId',signerId);
     fd.append('confirmation_name',signer.name||'Daniel Costa Ladeira');
     const r=await fetch('/api/signatures/sign',{method:'POST',body:fd});
     const j=await r.json();
     if(!r.ok||!j.ok)throw new Error(j.error||'Não foi possível assinar.');
     setDone(true);setMessage('Documento assinado pelo escritório.');
   }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 };

 if(done)return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl card p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={52}/><h1 className="mt-4 text-2xl font-black">Documento assinado</h1><p className="mt-2 text-sm text-slate-600">A assinatura de Daniel Costa Ladeira foi registrada.</p><div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center"><a href={`/api/signatures/${requestId}/final`} target="_blank" rel="noreferrer" className="btn btn-primary">Ver documento assinado</a><a href="/app/assinaturas?tab=assinadas" className="btn btn-secondary">Voltar para Assinaturas</a></div></div></main>;

 return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-5xl grid gap-4 lg:grid-cols-[1fr_380px]">
   <section className="card overflow-hidden">
     <div className="border-b p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0b6b5e] text-white"><ShieldCheck/></div><div><h1 className="text-lg font-black">Assinatura do escritório</h1><p className="text-xs font-semibold text-slate-500">Daniel Costa Ladeira · AdvOS</p></div></div></div>
     <div className="relative aspect-[1/1.3] bg-slate-100">
       {previewState==='loading'&&<div className="absolute inset-0 z-10 grid place-items-center bg-slate-100"><div className="text-center"><Loader2 className="mx-auto animate-spin text-[#075e54]" size={34}/><p className="mt-3 text-sm font-black text-slate-700">Carregando documento...</p></div></div>}
       {previewState==='error'&&<div className="absolute inset-0 z-10 grid place-items-center bg-slate-100 p-6"><div className="max-w-sm text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-700">!</div><h2 className="mt-3 text-base font-black text-slate-900">Documento indisponível</h2><p className="mt-1 text-sm text-slate-600">Não foi possível carregar o PDF para conferência.</p><button onClick={checkPreview} className="btn btn-secondary mt-4 inline-flex items-center gap-2"><RefreshCw size={15}/> Tentar novamente</button></div></div>}
       <iframe title="Documento" src={previewBlobUrl || undefined} className={`h-full w-full border-0 ${previewState==='error'||!previewBlobUrl?'invisible':''}`}/>
     </div>
   </section>
   <aside className="card p-5"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Documento</p><h2 className="mt-1 text-lg font-black">{title}</h2><p className="mt-1 text-sm text-slate-500">Signatário: Daniel Costa Ladeira</p>
     {message&&<div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{message}</div>}
     <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700"><div className="flex items-center gap-2 font-black text-slate-900"><Eye size={17}/> Visualização obrigatória</div><p className="mt-2">O documento precisa estar carregado para confirmar a visualização.</p></div>
     <button className="btn btn-secondary mt-3 w-full" onClick={view} disabled={busy||viewed||previewState!=='ready'}>{busy?<Loader2 className="animate-spin"/>:viewed?'Documento visualizado ✓':'Confirmar visualização'}</button>
     <label className={`mt-3 flex items-start gap-2 rounded-2xl border p-4 text-xs font-semibold ${previewState!=='ready'?'opacity-50':''}`}><input type="checkbox" checked={consent} disabled={previewState!=='ready'||!viewed} onChange={e=>setConsent(e.target.checked)} className="mt-0.5"/>Li o documento e concordo com a assinatura eletrônica pelo escritório.</label>
     <button className="btn btn-primary mt-3 w-full" onClick={sign} disabled={!viewed||!consent||previewState!=='ready'||busy}>{busy?<Loader2 className="animate-spin"/>:<CheckCircle2 size={16}/>}Assinar eletronicamente</button>
     <p className="mt-3 text-[10px] text-slate-500">Nenhuma assinatura manual é necessária.</p>
   </aside>
 </div></main>;
}
