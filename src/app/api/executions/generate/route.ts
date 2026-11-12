import { NextResponse } from 'next/server';
import { zipSync } from 'fflate';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  missingExecutionFields, isOverdueCollectible, isOutstandingCollectible, todayInBrazil,
  type ExecutionClient, type ExecutionInstallment,
} from '@/lib/executionShared';
import { renderExecution } from '@/lib/executionDocuments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeFilename(name:string) {
  const safe=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\\/<>:"|?*\x00-\x1F]/g,' ').replace(/\s+/g,' ').trim().slice(0,110);
  return safe || 'Cliente';
}

export async function POST(req:Request) {
  try {
    const { profile } = await getCurrentProfile();
    const form=await req.json();
    if(!form || form.confirmed!==true || !Array.isArray(form.selections) ||
      form.selections.length<1 || form.selections.length>40) {
      return NextResponse.json({error:'Selecione de 1 a 40 clientes e confirme o cálculo.'},{status:400});
    }
    const comarca=String(form.comarca||'').trim();
    if(!comarca || comarca.length>120 || /[<>\x00-\x1F]/.test(comarca))
      return NextResponse.json({error:'Comarca inválida.'},{status:400});
    const selected = form.selections.map((item:unknown)=>{
      const value=item as Record<string,unknown>;
      if(!value || typeof value!=='object')throw Error('Seleção inválida.');
      const id=String(value.clientId||'');
      const additionalFineCents=Number(value.additionalFineCents);
      if(!uuidPattern.test(id)||!Number.isSafeInteger(additionalFineCents)||
        additionalFineCents<0||additionalFineCents>1000000000)throw Error('Cliente ou multa inválida.');
      return {id,additionalFineCents};
    });
    const ids=selected.map(x=>x.id);
    if(new Set(ids).size!==ids.length) return NextResponse.json({error:'Clientes repetidos na seleção.'},{status:400});

    const db=createAdminSupabase();
    const firm=profile.law_firm_id;
    const clientResult=await db.from('clients')
      .select('id,name,naturalidade,civil_status,profession,rg,rg_uf,doc,address,contract_signed_on,contract_total_amount,contract_installment_count')
      .eq('law_firm_id',firm).in('id',ids);
    if(clientResult.error || (clientResult.data||[]).length!==ids.length) {
      return NextResponse.json({error:'Não foi possível conferir todos os clientes selecionados.'},{status:400});
    }
    const clients=new Map((clientResult.data as ExecutionClient[]).map(x=>[x.id,x]));
    const contracts=await db.from('financial_contracts').select('id,client_id,description')
      .eq('law_firm_id',firm).in('client_id',ids);
    if(contracts.error)throw Error('Falha ao consultar contratos financeiros.');
    const contractIds=(contracts.data||[]).map(x=>String(x.id));
    if(!contractIds.length)return NextResponse.json({error:'Nenhum contrato financeiro encontrado.'},{status:400});
    const installmentsRes=await db.from('financial_installments')
      .select('id,contract_id,amount,due_date,status,paid_at')
      .eq('law_firm_id',firm).in('contract_id',contractIds);
    if(installmentsRes.error)throw Error('Falha ao consultar parcelas financeiras.');
    const cMap=new Map((contracts.data||[]).map(x=>[String(x.id),{clientId:String(x.client_id),description:String(x.description||'Parcela contratual')}]));
    const byClient=new Map<string,ExecutionInstallment[]>();
    const today=todayInBrazil();
    for(const item of installmentsRes.data||[]) {
      const relation=cMap.get(String(item.contract_id));
      if(!relation)continue;
      const row:ExecutionInstallment={
        id:String(item.id),contract_id:String(item.contract_id),client_id:relation.clientId,
        amount:Number(item.amount),due_date:item.due_date,status:item.status,paid_at:item.paid_at,
        description:relation.description,
      };
      if(isOutstandingCollectible(row,today)){
        byClient.set(relation.clientId,[...(byClient.get(relation.clientId)||[]),row]);
      }
    }
    const hasFuture=selected.some(selection=>(byClient.get(selection.id)||[]).some(x=>!!x.due_date&&x.due_date>=today));
    if(hasFuture && form.accelerationConfirmed!==true)
      return NextResponse.json({error:'Confirme o fundamento de vencimento antecipado para as parcelas futuras.'},{status:400});

    // Every non-paid, non-cancelled installment is included, never a client-selected subset.
    const allFiles:Record<string,Uint8Array>={};
    const used=new Set<string>();
    for(const item of selected){
      const client=clients.get(item.id)!;
      const missing=missingExecutionFields(client);
      if(missing.length) return NextResponse.json({error:'Cadastro incompleto: '+client.name+' ('+missing.join(', ')+').'},{status:400});
      const remaining=(byClient.get(item.id)||[]).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)));
      const overdueCount=remaining.filter(row=>isOverdueCollectible(row,today)).length;
      if(overdueCount<2) return NextResponse.json({error:client.name+' não possui duas parcelas vencidas e não pagas.'},{status:400});
      if(remaining.length>250) return NextResponse.json({error:'Há parcelas demais para gerar: '+client.name},{status:400});

      let basename='Execucao - '+safeFilename(client.name);
      const root=basename.toLowerCase();
      if(used.has(root))basename+=' - '+item.id.slice(0,8);
      used.add(root);
      const rendered=await renderExecution({
        client,installments:remaining,comarca,today,additionalFineCents:item.additionalFineCents,
        accelerationConfirmed:form.accelerationConfirmed===true,
      });
      allFiles['Execucoes Judiciais/'+basename+'.docx']=rendered.docx;
      allFiles['Execucoes Judiciais/'+basename+'.pdf']=rendered.pdf;
    }
    const zip=zipSync(allFiles,{level:6});
    return new Response(Buffer.from(zip),{
      status:200,
      headers:{
        'Content-Type':'application/zip',
        'Content-Disposition':'attachment; filename="Execucoes-Judiciais.zip"',
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff',
      },
    });
  }catch(err:unknown){
    console.error('Falha ao gerar execuções em lote:', err instanceof Error?err.message:'erro desconhecido');
    return NextResponse.json({error:'Falha ao gerar os arquivos. Revise os dados e tente novamente.'},{status:500});
  }
}
