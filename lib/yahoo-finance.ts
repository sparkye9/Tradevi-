/**
 * Yahoo Finance client with crumb-based auth.
 * Yahoo Finance blocks plain server-side requests (403). This module handles
 * the cookie+crumb handshake required for their unofficial API to work from
 * server environments (Vercel, etc.).
 */

const YF_BASE = 'https://query1.finance.yahoo.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let cached: { crumb: string; cookies: string; ts: number } | null = null;
const TTL = 50 * 60 * 1000; // 50 min

async function getAuth(): Promise<{ crumb: string; cookies: string } | null> {
  if (cached && Date.now() - cached.ts < TTL) return cached;

  try {
    // Step 1: hit finance.yahoo.com to pick up session cookies
    const r1 = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    const raw = r1.headers.get('set-cookie') ?? '';
    const cookies = raw
      .split(',')
      .map(c => c.split(';')[0].trim())
      .filter(c => c.includes('='))
      .join('; ');

    // Step 2: fetch crumb token
    const r2 = await fetch(`${YF_BASE}/v1/test/getcrumb`, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': 'https://finance.yahoo.com/',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      cache: 'no-store',
    });

    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.startsWith('<') || crumb.startsWith('{')) return null;

    cached = { crumb, cookies, ts: Date.now() };
    return cached;
  } catch {
    return null;
  }
}

function headers(cookies: string): HeadersInit {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    ...(cookies ? { Cookie: cookies } : {}),
  };
}

/**
 * Drop-in replacement for fetch() against Yahoo Finance URLs.
 * Automatically adds the crumb URL param and session cookies.
 */
export async function yfFetch(url: string): Promise<Response> {
  const auth = await getAuth();

  let fullUrl = url;
  if (auth?.crumb) {
    const sep = url.includes('?') ? '&' : '?';
    fullUrl = `${url}${sep}crumb=${encodeURIComponent(auth.crumb)}`;
  }

  return fetch(fullUrl, {
    headers: headers(auth?.cookies ?? ''),
    cache: 'no-store',
  });
}
