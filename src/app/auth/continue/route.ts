import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectTo(request: Request, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url), 303);
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectTo(request, '/login?error=session');
  }

  const admin = createAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut().catch(() => null);
    return redirectTo(request, '/login?error=unauthorized');
  }

  if (String(profile.status || '').toLowerCase() !== 'ativo') {
    await supabase.auth.signOut().catch(() => null);
    return redirectTo(request, '/login?error=inactive');
  }

  return redirectTo(request, '/app/dashboard');
}
