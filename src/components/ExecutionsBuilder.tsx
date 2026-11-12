'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { calculateExecution, isOverdueCollectible, formatReal, formatBRDate, type ExecutionClient, type ExecutionInstallment } from '@/lib/executionShared';

export function ExecutionsBuilder({clients, installments, today, incompleteCount, withoutOverdueCount}: {
  clients: ExecutionClient[]; installments: ExecutionInstallment[];
  today: string; incompleteCount: number; withoutOverdueCount: number;
}) {
  const [selected,setSelected] = useState<string[]>([]);
  const [extraFines,setExtraFines] = useState<Record<string,string>>({});
  const [comarca,setComarca] = useState('Serra/ES');
  const [confirmed,setConfirmed] = useState(false);
  const [accelerationConfirmed,setAccelerationConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const rowsByClient=useMemo(()=>{
    const map = new Map<string,ExecutionInstallment[]>();
    for(const row of installments) map.set(row.client_id,[...(map.get(row.client_id)||[]),row]);
    return map;
  },[installments]);
  const selectedClients=clients.filter(c=>selected.includes(c.id));
  const hasFuture=selectedClients.some(c=>(rowsByClient.get(c.id)||[]).some(x=>!!x.due_date && x.due_date>=today));
  const principalTotal=selectedClients.reduce((sum,c)=>{
    return sum+(rowsByClient.get(c.id)||[]).reduce((v,i)=>v+Math.round(Number(i.amount)*100),0);
  },0);
  const toggle=(id:string)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  async function download() {
    setMessage('');
    if (!selectedClients.length) return setMessage('Selecione ao menos um cliente.');
    if (!confirmed) return setMessage('Confira os encargos e confirme as condições contratuais.');
    if (hasFuture && !accelerationConfirmed) return setMessage('Confirme a existência de fundamento contratual para cobrar parcelas futuras.');
    if (selectedClients.length>40) return setMessage('Selecione no máximo 40 clientes por ZIP.');
    if (!comarca.trim()||comarca.length>120) return setMessage('Informe a comarca competente.');
    try {
      const selections=selectedClients.map(c=>{
        const raw=extraFines[c.id]||'0';
        const value=Number(raw);
        if (!Number.isFinite(value)||value<0||value>10000000) throw new Error('Multa inválida para '+c.name);
        return {clientId:c.id,additionalFineCents:Math.round(value*100)};
      });
      setBusy(true);
      const response=await fetch('/api/executions/generate',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({selections,comarca:comarca.trim(),confirmed:true,accelerationConfirmed:hasFuture?accelerationConfirmed:false})});
      if(!response.ok){const x=await response.json().catch(()=>({}));throw Error(x.error||'Falha ao gerar documentos.');}
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url; link.download='Execucoes Judiciais - '+today+'.zip';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      setMessage('ZIP com DOCX e PDF de todos os clientes selecionados gerado. Revise antes do protocolo.');
    }catch(err:any){setMessage(String(err?.message||err));}finally{setBusy(false);}
  }

  return <div className="space-y-5">
    <section className="card p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div><p className="text-xs text-slate-500">Elegíveis (2+ atrasadas)</p><p className="text-2xl font-black">{clients.length}</p></div>
        <div><p className="text-xs text-slate-500">Cadastro incompleto</p><p className="text-2xl font-black">{incompleteCount}</p></div>
        <div><p className="text-xs text-slate-500">Menos de 2 vencidas</p><p className="text-2xl font-black">{withoutOverdueCount}</p></div>
      </div>
      {incompleteCount>0 && <p className="mt-3 text-sm text-slate-600">Apenas clientes com nome, estado civil, profissão, RG, órgão/UF, CPF, endereço, data, valor e número de parcelas do contrato preenchidos aparecem aqui. A nacionalidade será informada como brasileiro(a) nas petições; a naturalidade é opcional. <Link href="/app/clientes" className="font-bold underline">Completar cadastros</Link>.</p>}
      <p className="mt-3 text-xs text-slate-500">Data-base: {formatBRDate(today)}. Quitadas e canceladas ficam de fora. Clientes devem ter pelo menos duas parcelas já vencidas e não pagas.</p>
    </section>
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="max-w-sm flex-1 text-sm font-semibold">Comarca (conferir competência)
          <input className="input mt-1 w-full" value={comarca} maxLength={120} onChange={e=>setComarca(e.target.value)} />
        </label>
        <div className="text-right"><b>{selectedClients.length} cliente(s) selecionado(s)</b><p className="text-xs text-slate-500">Principal total ainda em aberto: {formatReal(principalTotal)}</p></div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Após atingir duas parcelas vencidas, a minuta incluirá todas as parcelas restantes não pagas do cliente, vencidas ou futuras. Os juros de 5% ao mês incidem apenas pelo tempo já transcorrido de atraso; o encargo fixo de 10% é discriminado por parcela. A antecipação de parcelas futuras depende de previsão contratual ou fundamento legal aplicável.</p>
      <button type="button" className="btn btn-secondary mt-4 text-xs" onClick={()=>setSelected(s=>s.length===clients.length?[]:clients.map(c=>c.id))}>
        {selected.length===clients.length?'Desmarcar todos':'Selecionar todos os elegíveis'}
      </button>
    </section>
    {clients.length===0 && <section className="card p-5 text-sm text-slate-600">
      Nenhum cliente apto no momento. Confira os demais dados obrigatórios e a existência de pelo menos duas parcelas vencidas e não pagas.
    </section>}
    <div className="space-y-3">
      {clients.map(client=>{
        const rows=rowsByClient.get(client.id)||[];
        const overdue=rows.filter(row=>isOverdueCollectible(row,today));
        const future=rows.filter(row=>!isOverdueCollectible(row,today));
        const calculated=calculateExecution(rows,today);
        return <section className="card p-4" key={client.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 font-black">
              <input type="checkbox" className="h-4 w-4" checked={selected.includes(client.id)} onChange={()=>toggle(client.id)} />
              {client.name}
            </label>
            <Link className="text-xs text-emerald-700 underline" href={'/app/clientes/'+client.id}>Ver ficha</Link>
          </div>
          <p className="mt-2 text-sm text-slate-600">{overdue.length} parcela(s) vencida(s) + {future.length} a vencer = {rows.length} parcela(s) restantes cobradas integralmente</p>
          <p className="mt-1 text-xs text-slate-500">Principal: {formatReal(calculated.principalCents)} · juros vencidos: {formatReal(calculated.interestCents)} · acréscimo fixo 10%: {formatReal(calculated.surchargeCents)}</p>
          <p className="mt-1 text-sm font-black">Montante devedor: {formatReal(calculated.amountDueCents)}</p>
          <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-bold">Ver todas as {rows.length} parcelas incluídas</summary>
            <div className="mt-2 grid gap-1 md:grid-cols-2">
              {rows.map(row=><div key={row.id} className="rounded-lg border p-2">{formatBRDate(String(row.due_date))} · {formatReal(Math.round(Number(row.amount)*100))} · {isOverdueCollectible(row,today)?'Vencida':'A vencer (antecipação)'}</div>)}
            </div>
          </details>
          {selected.includes(client.id) && <label className="mt-3 block max-w-xs text-xs font-bold">Multa contratual adicional (R$)
            <input className="input mt-1 w-full" type="number" min="0" max="10000000" step="0.01"
              value={extraFines[client.id]??''} onChange={e=>setExtraFines(x=>({...x,[client.id]:e.target.value}))} placeholder="0,00"/>
          </label>}
        </section>;
      })}
    </div>
    <section className="card space-y-4 p-5">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4"
        checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
        <span>Conferi os contratos e a compatibilidade dos juros de 5% ao mês, do acréscimo fixo de 10% por parcela e da eventual multa contratual adicional com cada título.</span>
      </label>
      {hasFuture && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4"
        checked={accelerationConfirmed} onChange={e=>setAccelerationConfirmed(e.target.checked)}/>
        <span>Confirmei, nos contratos selecionados, o fundamento de vencimento antecipado que autoriza cobrar também as parcelas ainda não vencidas.</span>
      </label>}
      <button type="button" className="btn btn-primary" disabled={busy||!confirmed||(hasFuture&&!accelerationConfirmed)||selected.length===0} onClick={()=>void download()}>
        {busy?'Gerando arquivos...':'Baixar um ZIP com DOCX e PDF de todos os selecionados'}
      </button>
      {message && <p className="text-sm text-slate-700" role="status">{message}</p>}
      <p className="text-xs text-slate-500">Cada cliente terá dois arquivos: Execucao - Nome do cliente.docx e Execucao - Nome do cliente.pdf, todos juntos no mesmo arquivo ZIP.</p>
    </section>
  </div>;
}
