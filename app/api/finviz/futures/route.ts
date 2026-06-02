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

let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 55 * 60 * 1000;

// Stale-data safety net — last successful Yahoo result kept in memory
let lastGoodResult: FinvizResult<FinvizFuture> | null = null;

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

async function doYahooFetch(auth: { crumb: string; cookie: string } | null, now: string): Promise<FinvizResult<FinvizFuture> | null> {
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
}

async function fetchYahooFutures(): Promise<FinvizResult<FinvizFuture>> {
  const now = new Date().toISOString();
  try {
    // First attempt with cached crumb
    const auth = await getCrumb();
    const result = await doYahooFetch(auth, now);
    if (result) {
      lastGoodResult = result;
      return result;
    }

    // Auth may be stale — refresh crumb and retry once
    crumbCache = null;
    const freshAuth = await getCrumb();
    const retry = await doYahooFetch(freshAuth, now);
    if (retry) {
      lastGoodResult = retry;
      return retry;
    }

    // Both attempts failed — serve last known good data if available
    if (lastGoodResult) {
      return { ...lastGoodResult, sourceError: 'Using cached data — Yahoo Finance temporarily unavailable' };
    }

    return { data: FUTURES_MAP.map(f => ({ symbol: f.symbol, name: f.name, price: null, changePercent: null, direction: null, lastUpdated: now })), source: 'Yahoo Finance', sourceError: 'Yahoo Finance unavailable', lastUpdated: now };
  } catch (err) {
    if (lastGoodResult) {
      return { ...lastGoodResult, sourceError: 'Using cached data — fetch error' };
    }
    return { data: [], source: 'Yahoo Finance', sourceError: `Futures fetch failed: ${String(err)}`, lastUpdated: now };
  }
}

export async function GET() {
  const result = await fetchFinvizFutures();
  if (!result.sourceError) {
    // Finviz worked — also cache it as a good result for the stale fallback
    lastGoodResult = result;
    return NextResponse.json(result);
  }
  // Finviz failed — always use Yahoo (with retry + stale cache safety net)
  return NextResponse.json(await fetchYahooFutures());
}
