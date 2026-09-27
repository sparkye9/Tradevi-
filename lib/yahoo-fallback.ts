// lib/yahoo-fallback.ts
// Yahoo Finance options fallback — used only when Tradier is not connected.
// Returns IV, OI, volume, bid, ask only. Never computes greeks.
// Data labeled as delayed.
//
// Yahoo's v7/finance/options endpoint has required a session cookie + crumb
// since ~2023 — calling it bare (as this file used to) gets a 401 from
// Yahoo's edge before the request ever reaches the options data, so this
// fallback was silently failing whenever it was actually needed. Fetch and
// cache a cookie/crumb pair the same way yahoo-finance2 does, and retry once
// with a fresh pair if the crumb has rotated.

const UA = 'Mozilla/5.0 (compatible; Tradevi/3.0)';

interface YahooSession {
  cookie: string;
  crumb: string;
  ts: number;
}

let session: YahooSession | null = null;
const SESSION_TTL = 55 * 60 * 1000; // Yahoo's cookie/crumb pair is good for roughly an hour

async function fetchYahooSession(): Promise<YahooSession | null> {
  try {
    const cookieResp = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
    });
    const setCookie = cookieResp.headers.get('set-cookie');
    if (!setCookie) return null;
    const cookie = setCookie.split(';')[0];

    const crumbResp = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    if (!crumbResp.ok) return null;
    const crumb = (await crumbResp.text()).trim();
    if (!crumb || crumb.includes('<')) return null;

    return { cookie, crumb, ts: Date.now() };
  } catch {
    return null;
  }
}

export async function getYahooSession(forceRefresh = false): Promise<YahooSession | null> {
  if (!forceRefresh && session && Date.now() - session.ts < SESSION_TTL) {
    return session;
  }
  const fresh = await fetchYahooSession();
  session = fresh;
  return fresh;
}

export interface YahooContract {
  symbol: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  iv: number | null;
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
}

export interface YahooOptionsResult {
  contracts: YahooContract[];
  sourceError?: string;
  source: 'Yahoo Finance';
  lastUpdated: string;
}

export interface YahooOptionContract {
  contractSymbol?: string;
  lastPrice?: number;
  expiration?: number;
  strike?: number;
  impliedVolatility?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
}

interface YahooOptionsResponse {
  optionChain?: {
    result?: Array<{
      options?: Array<{
        expirationDate?: number;
        calls?: YahooOptionContract[];
        puts?: YahooOptionContract[];
      }>;
    }>;
    error?: string | null;
  };
}

function parseYahooContract(
  opt: YahooOptionContract,
  type: 'call' | 'put',
  expiration: string
): YahooContract {
  return {
    symbol: opt.contractSymbol ?? '',
    expiration,
    strike: opt.strike ?? 0,
    type,
    iv: opt.impliedVolatility != null ? opt.impliedVolatility : null,
    volume: opt.volume != null ? opt.volume : null,
    openInterest: opt.openInterest != null ? opt.openInterest : null,
    bid: opt.bid != null ? opt.bid : null,
    ask: opt.ask != null ? opt.ask : null,
  };
}

async function requestOptions(symbol: string, sess: YahooSession | null): Promise<Response> {
  const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const url = sess ? `${base}?crumb=${encodeURIComponent(sess.crumb)}` : base;
  const headers: Record<string, string> = { 'User-Agent': UA };
  if (sess) headers.Cookie = sess.cookie;
  return fetch(url, { headers, cache: 'no-store' });
}

export async function fetchYahooOptions(symbol: string): Promise<YahooOptionsResult> {
  const now = new Date().toISOString();

  let json: YahooOptionsResponse;
  try {
    let sess = await getYahooSession();
    let resp = await requestOptions(symbol, sess);

    // Cookie/crumb can rotate server-side — refresh once and retry on auth failure.
    if (resp.status === 401 || resp.status === 403) {
      sess = await getYahooSession(true);
      resp = await requestOptions(symbol, sess);
    }

    if (!resp.ok) {
      return {
        contracts: [],
        sourceError: `Yahoo Finance HTTP ${resp.status}`,
        source: 'Yahoo Finance',
        lastUpdated: now,
      };
    }
    json = (await resp.json()) as YahooOptionsResponse;
  } catch (err) {
    return {
      contracts: [],
      sourceError: `Yahoo Finance fetch failed: ${String(err)}`,
      source: 'Yahoo Finance',
      lastUpdated: now,
    };
  }

  const result = json.optionChain?.result?.[0];
  if (!result) {
    return {
      contracts: [],
      sourceError: 'Yahoo Finance returned no options data',
      source: 'Yahoo Finance',
      lastUpdated: now,
    };
  }

  const contracts: YahooContract[] = [];

  for (const optionSet of result.options ?? []) {
    const expTs = optionSet.expirationDate;
    const expDate = expTs
      ? new Date(expTs * 1000).toISOString().split('T')[0]
      : 'unknown';

    for (const call of optionSet.calls ?? []) {
      contracts.push(parseYahooContract(call, 'call', expDate));
    }
    for (const put of optionSet.puts ?? []) {
      contracts.push(parseYahooContract(put, 'put', expDate));
    }
  }

  // Filter: volume > 50, OI > 100 where available
  const filtered = contracts.filter(
    (c) => (c.volume === null || c.volume > 50) && (c.openInterest === null || c.openInterest > 100)
  );

  return {
    contracts: filtered.slice(0, 20),
    source: 'Yahoo Finance',
    lastUpdated: now,
  };
}
