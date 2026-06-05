import { NextResponse } from 'next/server';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

const SYMBOLS = [
  { stooq: 'es.f',  symbol: 'ES',  name: 'S&P 500 Futures' },
  { stooq: 'nq.f',  symbol: 'NQ',  name: 'Nasdaq 100 Futures' },
  { stooq: 'ym.f',  symbol: 'YM',  name: 'Dow Jones Futures' },
  { stooq: 'rty.f', symbol: 'RTY', name: 'Russell 2000 Futures' },
  { stooq: 'gc.f',  symbol: 'GC',  name: 'Gold Futures' },
  { stooq: '^vix',  symbol: 'VIX', name: 'CBOE Volatility Index' },
  { stooq: 'nkd.f', symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Fetch one symbol from Stooq individually — more reliable than batch
async function fetchOneStooq(stooqSym: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    // Encode ^ but NOT the dot — Stooq requires literal dots in symbol names
    const encoded = stooqSym.replace('^', '%5E');
    const url = `https://stooq.com/q/l/?s=${encoded}&f=sd2t2ohlcvp&h&e=csv`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const lines = text.trim().split('\n');
    // Header row + at least one data row
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    // Format: Symbol,Date,Time,Open,High,Low,Close,Volume,%Chg
    if (cols.length < 9) return null;
    const price = parseFloat(cols[6]);
    const chg = parseFloat(cols[8].replace('%', ''));
    if (isNaN(price) || price <= 0) return null;
    return { price, changePercent: isNaN(chg) ? 0 : chg };
  } catch {
    return null;
  }
}

// Yahoo Finance fallback — no crumb, tries both query hosts
async function fetchYahooFallback(yahooSym: string): Promise<{ price: number; changePercent: number } | null> {
  const encoded = encodeURIComponent(yahooSym);
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encoded}&fields=regularMarketPrice,regularMarketChangePercent`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const q = json?.quoteResponse?.result?.[0];
      if (q?.regularMarketPrice != null) {
        return { price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent ?? 0 };
      }
    } catch {
      continue;
    }
  }
  return null;
}

const YAHOO_MAP: Record<string, string> = {
  'es.f': 'ES=F', 'nq.f': 'NQ=F', 'ym.f': 'YM=F',
  'rty.f': 'RTY=F', 'gc.f': 'GC=F', '^vix': '^VIX', 'nkd.f': 'NKD=F',
};

async function fetchSymbol(s: typeof SYMBOLS[0]): Promise<{ price: number | null; changePercent: number | null }> {
  // Try Stooq first
  const stooqResult = await fetchOneStooq(s.stooq);
  if (stooqResult) return stooqResult;
  // Fall back to Yahoo Finance
  const yahooSym = YAHOO_MAP[s.stooq];
  if (yahooSym) {
    const yahooResult = await fetchYahooFallback(yahooSym);
    if (yahooResult) return yahooResult;
  }
  return { price: null, changePercent: null };
}

let lastGood: FinvizResult<FinvizFuture> | null = null;
let lastFetchTs = 0;
const CACHE_TTL = 45_000;

export async function GET() {
  const now = new Date().toISOString();

  if (lastGood && Date.now() - lastFetchTs < CACHE_TTL) {
    return NextResponse.json(lastGood);
  }

  // Fetch all symbols in parallel
  const results = await Promise.all(SYMBOLS.map((s) => fetchSymbol(s)));

  const data: FinvizFuture[] = SYMBOLS.map((s, i) => {
    const { price, changePercent } = results[i];
    return {
      symbol: s.symbol,
      name: s.name,
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
  const successCount = data.filter((d) => d.price !== null).length;

  if (hasData) {
    lastGood = { data, source: 'Stooq / Yahoo Finance', lastUpdated: now };
    lastFetchTs = Date.now();
    return NextResponse.json(lastGood);
  }

  if (lastGood) {
    return NextResponse.json({ ...lastGood, sourceError: `Live fetch failed (${successCount}/${SYMBOLS.length}) — serving cached data` });
  }

  return NextResponse.json({
    data,
    source: 'Stooq / Yahoo Finance',
    sourceError: 'All data sources unavailable',
    lastUpdated: now,
  });
}
