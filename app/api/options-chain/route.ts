import { NextRequest, NextResponse } from 'next/server';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const YF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Crumb cache (warm-Lambda reuse) ───────────────────────────────────────────
let _crumb: { value: string; cookie: string; exp: number } | null = null;

function setCookiesToString(headers: Headers): string {
  // getSetCookie() returns all Set-Cookie values as an array (Node 18 / Fetch API)
  const getter = (headers as unknown as Record<string, unknown>).getSetCookie;
  const parts: string[] =
    typeof getter === 'function'
      ? (getter.call(headers) as string[])
      : [(headers.get('set-cookie') ?? '')];
  return parts.map(s => s.split(';')[0].trim()).filter(Boolean).join('; ');
}

async function fetchCrumb(): Promise<{ value: string; cookie: string } | null> {
  const now = Date.now();
  if (_crumb && now < _crumb.exp) return { value: _crumb.value, cookie: _crumb.cookie };

  // ── Method 1: Yahoo free-pass → crumb ──────────────────────────────────────
  try {
    const passRes = await fetch('https://fc.yahoo.com/v1/finance/freepass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': YF_UA },
      body: JSON.stringify({ browser: { experience: 'default', feature: 'unknown' } }),
      cache: 'no-store',
    });
    const cookie = setCookiesToString(passRes.headers);

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, 'Accept': '*/*', 'Cookie': cookie },
      cache: 'no-store',
    });
    const crumb = (await crumbRes.text()).trim();
    if (crumb && !crumb.trimStart().startsWith('<')) {
      _crumb = { value: crumb, cookie, exp: now + 3_600_000 };
      return { value: crumb, cookie };
    }
  } catch { /* fall through */ }

  // ── Method 2: Yahoo Finance homepage cookies → crumb ───────────────────────
  try {
    const homeRes = await fetch('https://finance.yahoo.com', {
      headers: { 'User-Agent': YF_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      cache: 'no-store',
    });
    const cookie = setCookiesToString(homeRes.headers);

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, 'Accept': '*/*', 'Cookie': cookie },
      cache: 'no-store',
    });
    const crumb = (await crumbRes.text()).trim();
    if (crumb && !crumb.trimStart().startsWith('<')) {
      _crumb = { value: crumb, cookie, exp: now + 3_600_000 };
      return { value: crumb, cookie };
    }
  } catch { /* fall through */ }

  return null;
}

// ── Fetch options JSON from Yahoo (with or without crumb) ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOptions(baseUrl: string, session: { value: string; cookie: string } | null): Promise<any> {
  const url = session
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(session.value)}`
    : baseUrl;

  const headers: Record<string, string> = {
    'User-Agent':      YF_UA,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://finance.yahoo.com/',
  };
  if (session?.cookie) headers['Cookie'] = session.cookie;

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo returned HTML');
  return JSON.parse(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSuccess(symbol: string, result: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any          = result.options?.[0] ?? {};
  const rawDates: number[] = result.expirationDates ?? [];
  const expirations        = rawDates.map((ts: number) => new Date(ts * 1000).toISOString().split('T')[0]);
  const underlyingPrice: number = result.quote?.regularMarketPrice ?? 0;

  return json({
    success:         true,
    symbol,
    underlyingPrice,
    expirations,
    expirationDates: expirations,
    calls:           opts.calls ?? [],
    puts:            opts.puts  ?? [],
    meta: {
      dataSource: 'yahoo_delayed',
      fetchedAt:  new Date().toISOString(),
      delayNote:  'Options data ~15-20 min delayed.',
    },
  });
}

const ERR = json({
  success: false,
  error:   'Options chain unavailable',
  expirations: [], expirationDates: [], calls: [], puts: [],
}, 503);

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase();
  if (!symbol) {
    return json({ success: false, error: 'symbol is required', expirations: [], calls: [], puts: [] }, 400);
  }

  const expiration = sp.get('expiration');
  let baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  if (expiration) {
    const epoch = Math.floor(new Date(expiration).getTime() / 1000);
    baseUrl += `?date=${epoch}`;
  }

  // ── Try 1: no crumb (fast path, works from some server regions) ─────────────
  try {
    const data   = await fetchOptions(baseUrl, null);
    const result = data?.optionChain?.result?.[0];
    if (result) return buildSuccess(symbol, result);
  } catch (e) {
    console.log(`[options-chain] no-crumb attempt failed (${e instanceof Error ? e.message : e}), trying with crumb`);
  }

  // ── Try 2: with crumb ───────────────────────────────────────────────────────
  const session = await fetchCrumb();
  if (!session) {
    console.error(`[options-chain] ${symbol}: could not obtain Yahoo crumb`);
    return ERR;
  }

  try {
    const data   = await fetchOptions(baseUrl, session);
    const result = data?.optionChain?.result?.[0];
    if (!result) throw new Error('no result in response');
    return buildSuccess(symbol, result);
  } catch (e) {
    // Crumb may have expired — bust cache so next request re-authenticates
    _crumb = null;
    console.error(`[options-chain] ${symbol}:`, e instanceof Error ? e.message : e);
    return ERR;
  }
}
