import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isOwnerEmail } from '@/lib/ownerAccess';

// Fully public — no login required. /reset-password must stay open even
// though it establishes a session, because the recovery token it needs
// arrives in the URL fragment (never sent to the server) and is only
// parsed client-side after the page has already loaded.
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
]);

// The home page (and the futures ticker shown in the header on every page)
// depend on these two data endpoints, so they stay reachable by anonymous
// visitors. The PayPal webhook is unauthenticated by design — it verifies
// its own signature instead.
const PUBLIC_API_PREFIXES = ['/api/finviz/screener', '/api/finviz/futures', '/api/paypal/webhook'];

// Requires login, but not an active subscription — this is how you get one.
const LOGIN_ONLY_PATHS = new Set([
  '/subscribe',
  '/account',
  '/api/subscription/link',
  '/api/subscription/cancel',
  '/api/paypal/status',
]);

function redirectTo(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (PUBLIC_PATHS.has(path) || PUBLIC_API_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail safe, not fail open: if accounts aren't configured on this
  // deployment yet, send visitors to /login (which explains why) instead of
  // either crashing (missing env vars make the Supabase client throw) or
  // letting everyone straight into the gated app.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (path === '/api/paypal/status' || path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Accounts are not configured on this deployment yet.' }, { status: 503 });
    }
    return redirectTo(request, '/login', { misconfigured: '1' });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (e) {
    console.error('Supabase auth check failed in middleware:', e);
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Auth check failed' }, { status: 503 });
    }
    return redirectTo(request, '/login', { misconfigured: '1' });
  }

  if (!user) {
    return redirectTo(request, '/login', { next: path });
  }

  if (LOGIN_ONLY_PATHS.has(path)) {
    return response;
  }

  if (isOwnerEmail(user.email)) {
    return response;
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (sub?.status !== 'ACTIVE') {
    return redirectTo(request, '/subscribe');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
