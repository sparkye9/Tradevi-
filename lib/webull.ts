// lib/webull.ts — Webull Premium options data client (unofficial API, phone login)
// Provides: delta, gamma, theta, vega, IV, volume, OI, bid, ask per contract
// Greeks are available on Webull Premium accounts

import { createHash } from 'crypto';

export interface WebullContract {
  symbol: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
  greeksUpdated: string;
}

export interface WebullOptionsResult {
  contracts: WebullContract[];
  sourceError?: string;
  source: string;
  lastUpdated: string;
}

interface WebullSession {
  accessToken: string;
  refreshToken: string;
  uuid: string;
  ts: number;
}

const SESSION_TTL = 6 * 60 * 60 * 1000; // 6 hours
const TICKER_CACHE = new Map<string, { id: string; ts: number }>();
const TICKER_TTL = 60 * 60 * 1000; // 1 hour

let session: WebullSession | null = null;

const DEVICE_ID = 'Tradevi-' + Math.random().toString(36).slice(2, 18);

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex');
}

function baseHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
    'did': DEVICE_ID,
    'hl': 'en',
    'os': 'web',
    'ver': '3.40.8',
    'ph': 'MacOS web',
    't_time': Date.now().toString(),
  };
  if (token) h['access_token'] = token;
  return h;
}

async function login(): Promise<{ session: WebullSession | null; error?: string }> {
  const phone = process.env.WEBULL_PHONE;
  const password = process.env.WEBULL_PASSWORD;
  if (!phone || !password) {
    return { session: null, error: 'Set WEBULL_PHONE and WEBULL_PASSWORD in .env.local' };
  }

  try {
    const body = {
      account: phone,
      accountType: '2', // 2 = phone
      deviceId: DEVICE_ID,
      deviceName: 'Tradevi',
      grade: '1',
      pwd: md5(md5(password)),
      regionId: '1',
    };

    const resp = await fetch('https://userapi.webull.com/api/passport/login/v5/account', {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      return { session: null, error: `Webull login HTTP ${resp.status}` };
    }

    const json = await resp.json();
    const data = json?.data;
    if (!data?.accessToken) {
      return { session: null, error: 'Webull login failed — check WEBULL_PHONE and WEBULL_PASSWORD' };
    }

    return {
      session: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? '',
        uuid: data.uuid ?? '',
        ts: Date.now(),
      },
    };
  } catch (err) {
    return { session: null, error: `Webull login error: ${String(err)}` };
  }
}

async function getSession(): Promise<{ token: string | null; error?: string }> {
  if (session && Date.now() - session.ts < SESSION_TTL) {
    return { token: session.accessToken };
  }
  const { session: s, error } = await login();
  if (!s) return { token: null, error };
  session = s;
  return { token: s.accessToken };
}

async function getTickerId(symbol: string, token: string): Promise<string | null> {
  const cached = TICKER_CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < TICKER_TTL) return cached.id;

  try {
    const url = `https://quotes-gw.webullfintech.com/api/search/pc/tickers?keyword=${encodeURIComponent(symbol)}&pageIndex=1&pageSize=10`;
    const resp = await fetch(url, { headers: baseHeaders(token) });
    if (!resp.ok) return null;
    const json = await resp.json();
    const tickers: { tickerId?: string; disSymbol?: string }[] = json?.data?.list ?? [];
    const match = tickers.find((t) => t.disSymbol?.toUpperCase() === symbol.toUpperCase());
    if (!match?.tickerId) return null;
    TICKER_CACHE.set(symbol, { id: match.tickerId, ts: Date.now() });
    return match.tickerId;
  } catch {
    return null;
  }
}

export async function fetchWebullOptions(symbol: string): Promise<WebullOptionsResult> {
  const now = new Date().toISOString();

  const { token, error: sessionError } = await getSession();
  if (!token) {
    return {
      contracts: [],
      sourceError: sessionError,
      source: 'Webull Premium',
      lastUpdated: now,
    };
  }

  const tickerId = await getTickerId(symbol, token);
  if (!tickerId) {
    return {
      contracts: [],
      sourceError: `Could not find Webull ticker ID for ${symbol}`,
      source: 'Webull Premium',
      lastUpdated: now,
    };
  }

  try {
    // Fetch nearest expiration list
    const expUrl = `https://quotes-gw.webullfintech.com/api/quote/option/expdate?tickerId=${tickerId}`;
    const expResp = await fetch(expUrl, { headers: baseHeaders(token) });
    if (!expResp.ok) {
      return { contracts: [], sourceError: `Webull expirations HTTP ${expResp.status}`, source: 'Webull Premium', lastUpdated: now };
    }
    const expJson = await expResp.json();
    const expirations: string[] = expJson?.data ?? [];
    if (!expirations.length) {
      return { contracts: [], sourceError: 'No expirations available', source: 'Webull Premium', lastUpdated: now };
    }
    const expiration = expirations[0]; // nearest

    // Fetch options chain with greeks
    const chainUrl = `https://quotes-gw.webullfintech.com/api/quote/option/query/v2?tickerId=${tickerId}&expireDate=${expiration}&direction=all`;
    const chainResp = await fetch(chainUrl, { headers: baseHeaders(token) });
    if (!chainResp.ok) {
      return { contracts: [], sourceError: `Webull chain HTTP ${chainResp.status}`, source: 'Webull Premium', lastUpdated: now };
    }
    const chainJson = await chainResp.json();

    const rawOptions: Record<string, unknown>[] = [];
    const data = chainJson?.data ?? [];
    for (const row of data) {
      const r = row as Record<string, unknown>;
      if (r.call) rawOptions.push({ ...(r.call as Record<string, unknown>), _type: 'call' });
      if (r.put) rawOptions.push({ ...(r.put as Record<string, unknown>), _type: 'put' });
    }

    const contracts: WebullContract[] = [];
    for (const raw of rawOptions) {
      const delta = raw.delta != null ? parseFloat(String(raw.delta)) : null;
      const gamma = raw.gamma != null ? parseFloat(String(raw.gamma)) : null;
      const theta = raw.theta != null ? parseFloat(String(raw.theta)) : null;
      const vega = raw.vega != null ? parseFloat(String(raw.vega)) : null;
      const iv = raw.implVol != null ? parseFloat(String(raw.implVol)) : null;
      const volume = raw.volume != null ? parseInt(String(raw.volume), 10) : null;
      const oi = raw.openInterest != null ? parseInt(String(raw.openInterest), 10) : null;
      const bid = raw.bidPrice != null ? parseFloat(String(raw.bidPrice)) : null;
      const ask = raw.askPrice != null ? parseFloat(String(raw.askPrice)) : null;
      const strike = raw.strikePrice != null ? parseFloat(String(raw.strikePrice)) : 0;
      const type = raw._type === 'put' ? 'put' : 'call';

      // Filter: delta band 0.20-0.70 (absolute), volume > 50, OI > 100
      const absDelta = delta !== null ? Math.abs(delta) : null;
      if (absDelta !== null && (absDelta < 0.2 || absDelta > 0.7)) continue;
      if (volume !== null && volume < 50) continue;
      if (oi !== null && oi < 100) continue;

      contracts.push({
        symbol: `${symbol}${expiration.replace(/-/g, '')}${type === 'call' ? 'C' : 'P'}${strike}`,
        expiration,
        strike,
        type,
        delta,
        gamma,
        theta,
        vega,
        iv,
        volume,
        openInterest: oi,
        bid,
        ask,
        greeksUpdated: now,
      });
    }

    // Sort calls by delta desc, puts by delta asc; take top 5 of each
    const calls = contracts.filter((c) => c.type === 'call')
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
      .slice(0, 5);
    const puts = contracts.filter((c) => c.type === 'put')
      .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
      .slice(0, 5);

    return {
      contracts: [...calls, ...puts],
      source: 'Webull Premium',
      lastUpdated: now,
    };
  } catch (err) {
    return {
      contracts: [],
      sourceError: `Webull fetch error: ${String(err)}`,
      source: 'Webull Premium',
      lastUpdated: now,
    };
  }
}
