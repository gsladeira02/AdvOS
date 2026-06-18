import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';

export async function POST(req:Request){
  const {supabase,profile}=await getCurrentProfile();
  const f=await req.formData();
  const clientId=String(f.get('client_id') || '');
  const serviceId=String(f.get('service_id') || '') || null;
  if(clientId){
    await supabase.from('clients').update({service_id:serviceId}).eq('id',clientId).eq('law_firm_id',profile.law_firm_id);
  }
  return NextResponse.redirect(new URL(`/app/clientes/${clientId}`,req.url),303);
}
