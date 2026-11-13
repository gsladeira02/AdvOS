import { NextResponse } from 'next/server';
import { getCurrentAdminProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { EXECUTION_TEMPLATE_NAME, validateExecutionTemplate } from '@/lib/executionTemplate';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request) {
  try {
    const {profile}=await getCurrentAdminProfile();
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.docx'))
      return NextResponse.json({error:'Envie o modelo original em .docx.'},{status:400});
    if(file.size>3_000_000||file.size<1000)
      return NextResponse.json({error:'O modelo deve ter entre 1 KB e 3 MB.'},{status:400});
    const bytes=new Uint8Array(await file.arrayBuffer());
    validateExecutionTemplate(bytes);
    const db=createAdminSupabase();
    const {error}=await db.from('document_templates').insert({
      law_firm_id:profile.law_firm_id,name:EXECUTION_TEMPLATE_NAME,
      category:'execucoes_judiciais',content:Buffer.from(bytes).toString('base64'),
    });
    if(error)throw new Error('Não foi possível salvar o modelo no escritório.');
    return NextResponse.json({ok:true});
  }catch(error:unknown){
    console.error('Falha ao salvar modelo de execução:',error instanceof Error?error.message:'erro desconhecido');
    return NextResponse.json({error:error instanceof Error?error.message:'Falha ao salvar o modelo.'},{status:400});
  }
}
