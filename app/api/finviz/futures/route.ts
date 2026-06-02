import { NextResponse } from 'next/server';
import { fetchFinvizFutures } from '@/lib/finviz';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

const FUTURES_MAP: { yahoo: string; symbol: string; name: string }[] = [
  { yahoo: 'ES=F', symbol: 'ES', name: 'S&P 500 Futures' },
  { yahoo: 'NQ=F', symbol: 'NQ', name: 'Nasdaq 100 Futures' },
  { yahoo: 'YM=F', symbol: 'YM', name: 'Dow Jones Futures' },
  { yahoo: 'RTY=F', symbol: 'RTY', name: 'Russell 2000 Futures' },
  { yahoo: 'NKD=F', symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// In-memory caches (warm across requests in same Vercel instance)
let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 55 * 60 * 1000;
let lastGoodResult: FinvizResult<FinvizFuture> | null = null;

// ── Crumb auth ────────────────────────────────────────────────────────────────

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }
  try {
    const homeResp = await fetch('https://finance.yahoo.com', {
      headers: { ...YF_HEADERS, Accept: 'text/html' },
      redirect: 'follow',
    });
    const rawCookies = homeResp.headers.get('set-cookie') ?? '';
    const cookieParts: string[] = [];
    const cookieRegex = /([A-Z0-9_]+=[^;]+)/g;
    let cookieMatch: RegExpExecArray | null;
    while ((cookieMatch = cookieRegex.exec(rawCookies)) !== null) {
      if (['A1', 'A3', 'A1S', 'A1i', 'GUC', 'GUCS'].includes(cookieMatch[1].split('=')[0])) {
        cookieParts.push(cookieMatch[1]);
      }
    }
    const cookie = cookieParts.join('; ');
    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YF_HEADERS, Accept: 'text/plain', Cookie: cookie },
    });
    if (!crumbResp.ok) return null;
    const crumb = (await crumbResp.text()).trim();
    if (!crumb || crumb.length < 3) return null;
    crumbCache = { crumb, cookie, ts: Date.now() };
    return { crumb, cookie };
  } catch {
    return null;
  }
}

// ── Method 1: Yahoo v7 batch quote (crumb auth) ────────────────────────────

async function tryYahooQuoteApi(auth: { crumb: string; cookie: string } | null, now: string): Promise<FinvizResult<FinvizFuture> | null> {
  try {
    const symbols = FUTURES_MAP.map((f) => f.yahoo).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent${auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`;
    const headers: Record<string, string> = { ...YF_HEADERS, Accept: 'application/json' };
    if (auth?.cookie) headers['Cookie'] = auth.cookie;

    const resp = await fetch(url, { headers, cache: 'no-store' });
    if (!resp.ok) return null;

    const json = await resp.json();
    const quotes: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number }[] =
      json?.quoteResponse?.result ?? [];
    if (quotes.length === 0) return null;

    const quoteMap: Record<string, typeof quotes[0]> = {};
    for (const q of quotes) quoteMap[q.symbol] = q;

    const data: FinvizFuture[] = FUTURES_MAP.map((f) => {
      const q = quoteMap[f.yahoo];
      const price = q?.regularMarketPrice ?? null;
      const changePercent = q?.regularMarketChangePercent ?? null;
      return {
        symbol: f.symbol, name: f.name, price, changePercent,
        direction: changePercent === null ? null : changePercent > 0.05 ? 'up' : changePercent < -0.05 ? 'down' : 'flat',
        lastUpdated: now,
      };
    });

    return { data, source: 'Yahoo Finance', lastUpdated: now };
  } catch {
    return null;
  }
}

// ── Method 2: Yahoo v8 chart API (no crumb needed) ────────────────────────

async function fetchChartQuote(yahooSymbol: string): Promise<{ price: number | null; changePercent: number | null }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const resp = await fetch(url, { headers: { ...YF_HEADERS, Accept: 'application/json' }, cache: 'no-store' });
    if (!resp.ok) return { price: null, changePercent: null };
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return { price: null, changePercent: null };
    const price: number | null = meta.regularMarketPrice ?? null;
    const prevClose: number | null = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const changePercent = price !== null && prevClose !== null && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : null;
    return { price, changePercent };
  } catch {
    return { price: null, changePercent: null };
  }
}

async function tryYahooChartApi(now: string): Promise<FinvizResult<FinvizFuture> | null> {
  try {
    const results = await Promise.all(FUTURES_MAP.map((f) => fetchChartQuote(f.yahoo)));
    const data: FinvizFuture[] = FUTURES_MAP.map((f, i) => {
      const { price, changePercent } = results[i];
      return {
        symbol: f.symbol, name: f.name, price, changePercent,
        direction: changePercent === null ? null : changePercent > 0.05 ? 'up' : changePercent < -0.05 ? 'down' : 'flat',
        lastUpdated: now,
      };
    });

    // Only succeed if at least one symbol came back with a price
    if (data.every((d) => d.price === null)) return null;
    return { data, source: 'Yahoo Finance', lastUpdated: now };
  } catch {
    return null;
  }
}

// ── Main Yahoo orchestrator ───────────────────────────────────────────────────

async function fetchYahooFutures(): Promise<FinvizResult<FinvizFuture>> {
  const now = new Date().toISOString();

  // 1. Try v7 quote API with cached crumb
  const auth = await getCrumb();
  const attempt1 = await tryYahooQuoteApi(auth, now);
  if (attempt1) { lastGoodResult = attempt1; return attempt1; }

  // 2. Refresh crumb and retry v7
  crumbCache = null;
  const freshAuth = await getCrumb();
  const attempt2 = await tryYahooQuoteApi(freshAuth, now);
  if (attempt2) { lastGoodResult = attempt2; return attempt2; }

  // 3. Chart API — no crumb needed, works from cloud IPs
  const attempt3 = await tryYahooChartApi(now);
  if (attempt3) { lastGoodResult = attempt3; return attempt3; }

  // 4. Serve last known good data (stale but better than nothing)
  if (lastGoodResult) {
    return { ...lastGoodResult, sourceError: 'Stale data — all Yahoo endpoints failed' };
  }

  // 5. Absolute last resort — return all symbols with null prices so bar renders
  return {
    data: FUTURES_MAP.map((f) => ({
      symbol: f.symbol, name: f.name, price: null, changePercent: null, direction: null, lastUpdated: now,
    })),
    source: 'Yahoo Finance',
    sourceError: 'Futures data unavailable',
    lastUpdated: now,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const finviz = await fetchFinvizFutures();
  if (!finviz.sourceError) {
    lastGoodResult = finviz;
    return NextResponse.json(finviz);
  }
  return NextResponse.json(await fetchYahooFutures());
}
