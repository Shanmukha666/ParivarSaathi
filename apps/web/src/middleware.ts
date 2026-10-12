import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { decideAccess, type StaffRole } from './lib/access';
import { hasSupabaseConfig, isDemoMode } from './lib/demo-mode';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  // Explicit demo mode: staff pages are viewable; the data APIs still authorize and only
  // serve clearly labelled synthetic data to anonymous callers.
  if (isDemoMode()) return response;
  if (!hasSupabaseConfig()) {
    if (process.env.NODE_ENV === 'production' && !isDemoMode()) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookies => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  let roles: StaffRole[] = [];
  if (user) {
    const { data } = await supabase.from('staff_roles').select('role').eq('user_id', user.id);
    roles = (data || []).map((row) => row.role).filter((role): role is StaffRole => role === 'admin' || role === 'counsellor');
  }
  const decision = decideAccess(request.nextUrl.pathname, roles);
  if (decision.action === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/counsellor/:path*'],
};
