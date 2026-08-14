import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * PKCE / OTP exchange for Supabase auth emails (confirm signup, password recovery).
 *
 * Emails should land here with ?code=... (PKCE) or ?token_hash=&type= (OTP).
 * Middleware also forwards those params here if Supabase dropped the user on "/".
 *
 * Confirmation links are often used twice (mail-app prefetch, a second tap).
 * The second hit looks like an expired link even though the account is already
 * confirmed — send those people to sign in, not a red "start over" error.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/subscribe';
  }
  return next;
}

const OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function loginNoticeUrl(origin: string, typeParam: string | null): string {
  const notice = typeParam === 'recovery' ? 'reset' : 'ready';
  return `${origin}/login?notice=${notice}`;
}

async function afterFailedExchange(
  supabase: { auth: { getUser: () => Promise<{ data: { user: unknown } }> } },
  origin: string,
  next: string,
  typeParam: string | null,
): Promise<NextResponse> {
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(loginNoticeUrl(origin, typeParam));
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const typeParam = searchParams.get('type');
  const next = safeNext(searchParams.get('next'));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if ((!code && !tokenHash) || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(loginNoticeUrl(origin, typeParam));
  }

  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return afterFailedExchange(supabase, origin, next, typeParam);
    }
  } else if (tokenHash) {
    const type = OTP_TYPES.has(typeParam as EmailOtpType) ? (typeParam as EmailOtpType) : 'signup';
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return afterFailedExchange(supabase, origin, next, type);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
