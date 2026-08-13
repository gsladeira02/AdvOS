import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { profile } = await getCurrentProfile();
  const f = await req.formData();
  const admin = createAdminSupabase();
  const { error } = await admin.from('deadlines').insert({law_firm_id:profile.law_firm_id,case_id:f.get('case_id')||null,client_id:f.get('client_id')||null,title:f.get('title'),description:f.get('description'),due_date:f.get('due_date'),responsible:f.get('responsible'),priority:f.get('priority'),status:f.get('status')});
  if (error) return NextResponse.json({ error: 'Não foi possível salvar os dados.' }, { status: 400 });
  return NextResponse.redirect(new URL('/app/prazos', req.url), 303);
}
