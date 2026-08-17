import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const { error } = await admin.from('cases').insert({law_firm_id:profile.law_firm_id,client_id:f.get('client_id')||null,case_number:f.get('case_number'),area:f.get('area'),action_type:f.get('action_type'),court:f.get('court'),district:f.get('district'),opposing_party:f.get('opposing_party'),responsible:f.get('responsible'),phase:f.get('phase'),status:f.get('status'),claim_value:Number(f.get('claim_value')||0),notes:f.get('notes')});
  if (error) return NextResponse.json({ error: 'Não foi possível salvar os dados.' }, { status: 400 });
  return NextResponse.redirect(new URL('/app/processos', req.url), 303);
}
