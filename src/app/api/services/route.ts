import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';

function num(v: FormDataEntryValue | null) {
  const n = Number(String(v || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req:Request){
  const {supabase,profile}=await getCurrentProfile();
  const f=await req.formData();
  await supabase.from('legal_services').insert({
    law_firm_id:profile.law_firm_id,
    name:f.get('name'),
    description:f.get('description'),
    default_amount:num(f.get('default_amount')),
    active:String(f.get('active') || 'true') === 'true',
  });
  return NextResponse.redirect(new URL('/app/servicos',req.url),303);
}
