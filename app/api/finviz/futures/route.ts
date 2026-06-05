import { NextResponse } from 'next/server';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

const FUTURES_MAP = [
  { yahoo: 'ES=F',  symbol: 'ES',  name: 'S&P 500 Futures' },
  { yahoo: 'NQ=F',  symbol: 'NQ',  name: 'Nasdaq 100 Futures' },
  { yahoo: 'YM=F',  symbol: 'YM',  name: 'Dow Jones Futures' },
  { yahoo: 'RTY=F', symbol: 'RTY', name: 'Russell 2000 Futures' },
  { yahoo: 'GC=F',  symbol: 'GC',  name: 'Gold Futures' },
  { yahoo: '^VIX',  symbol: 'VIX', name: 'CBOE Volatility Index' },
  { yahoo: 'NKD=F', symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 50 * 60 * 1000;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) return crumbCache;
  try {
    const homeResp = await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': YF_HEADERS['User-Agent'],
        'Accept': 'text/html',
      },
    });
    const setCookie = homeResp.headers.get('set-cookie') ?? '';
    const cookies: string[] = [];
    for (const part of setCookie.split(',')) {
      const kv = part.trim().split(';')[0];
      if (/^(A1|A3|A1S|GUC|GUCS)=/i.test(kv)) cookies.push(kv);
    }
    const cookie = cookies.join('; ');

    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YF_HEADERS, Cookie: cookie },
    });
    if (!crumbResp.ok) return null;
    const crumb = (await crumbResp.text()).trim();
    if (!crumb || crumb.length < 3) return null;
    crumbCache = { crumb, cookie, ts: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

async function fetchWithCrumb(symbols: string[]): Promise<Record<string, { price: number; changePercent: number }>> {
  const auth = await getCrumb();
  const symStr = symbols.join(',');
  const fields = 'regularMarketPrice,regularMarketChangePercent';

  const tryFetch = async (baseUrl: string, extra: Record<string, string> = {}) => {
    const url = `${baseUrl}?symbols=${encodeURIComponent(symStr)}&fields=${fields}${auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`;
    const headers: Record<string, string> = { ...YF_HEADERS, ...extra };
    if (auth?.cookie) headers['Cookie'] = auth.cookie;
    const r = await fetch(url, { headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return (j?.quoteResponse?.result ?? []) as { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number }[];
  };

  let results;
  try {
    results = await tryFetch('https://query1.finance.yahoo.com/v7/finance/quote');
  } catch {
    try {
      results = await tryFetch('https://query2.finance.yahoo.com/v7/finance/quote');
    } catch {
      crumbCache = null;
      return {};
    }
  }

  const out: Record<string, { price: number; changePercent: number }> = {};
  for (const q of results) {
    if (q.regularMarketPrice != null && q.regularMarketChangePercent != null) {
      out[q.symbol] = { price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent };
    }
  }
  return out;
}

let lastGood: FinvizResult<FinvizFuture> | null = null;
let lastFetchTs = 0;
const CACHE_TTL = 45_000;

export async function GET() {
  const now = new Date().toISOString();

  if (lastGood && Date.now() - lastFetchTs < CACHE_TTL) {
    return NextResponse.json(lastGood);
  }

  const yahooSymbols = FUTURES_MAP.map((f) => f.yahoo);
  const quotes = await fetchWithCrumb(yahooSymbols);

  const data: FinvizFuture[] = FUTURES_MAP.map((f) => {
    const q = quotes[f.yahoo];
    const price = q?.price ?? null;
    const changePercent = q?.changePercent ?? null;
    return {
      symbol: f.symbol,
      name: f.name,
      price,
      changePercent,
      direction: changePercent === null ? null
        : changePercent > 0.05 ? 'up'
        : changePercent < -0.05 ? 'down'
        : 'flat',
      lastUpdated: now,
    };
  });

  const hasData = data.some((d) => d.price !== null);

  if (hasData) {
    lastGood = { data, source: 'Yahoo Finance', lastUpdated: now };
    lastFetchTs = Date.now();
    return NextResponse.json(lastGood);
  }

  if (lastGood) {
    return NextResponse.json({ ...lastGood, sourceError: 'Using cached data — live fetch returned no prices' });
  }

  return NextResponse.json({
    data: FUTURES_MAP.map((f) => ({ symbol: f.symbol, name: f.name, price: null, changePercent: null, direction: null, lastUpdated: now })),
    source: 'Yahoo Finance',
    sourceError: 'No data — Yahoo Finance may be temporarily unavailable',
    lastUpdated: now,
  });
}
