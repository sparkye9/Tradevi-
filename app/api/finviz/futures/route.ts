import { NextResponse } from 'next/server';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

// Stooq: free, no auth, reliable from cloud servers
// https://stooq.com/q/l/?s=es.f,nq.f&f=sd2t2ohlcvp&h&e=csv
const SYMBOLS = [
  { stooq: 'es.f',  symbol: 'ES',  name: 'S&P 500 Futures' },
  { stooq: 'nq.f',  symbol: 'NQ',  name: 'Nasdaq 100 Futures' },
  { stooq: 'ym.f',  symbol: 'YM',  name: 'Dow Jones Futures' },
  { stooq: 'rty.f', symbol: 'RTY', name: 'Russell 2000 Futures' },
  { stooq: 'gc.f',  symbol: 'GC',  name: 'Gold Futures' },
  { stooq: '^vix',  symbol: 'VIX', name: 'CBOE Volatility Index' },
  { stooq: 'nkd.f', symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

const STOOQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/csv,text/plain,*/*',
};

function parseStooqCsv(csv: string): Map<string, { price: number; changePercent: number }> {
  const result = new Map<string, { price: number; changePercent: number }>();
  const lines = csv.trim().split('\n').slice(1); // skip header
  for (const line of lines) {
    const cols = line.split(',');
    // Format: Symbol,Date,Time,Open,High,Low,Close,Volume,%Chg
    if (cols.length < 9) continue;
    const sym = cols[0].trim().toLowerCase();
    const close = parseFloat(cols[6]);
    const chg = parseFloat(cols[8].replace('%', ''));
    if (!isNaN(close) && close > 0 && !isNaN(chg)) {
      result.set(sym, { price: close, changePercent: chg });
    }
  }
  return result;
}

async function fetchStooq(): Promise<Map<string, { price: number; changePercent: number }>> {
  const batch = SYMBOLS.map((s) => s.stooq).join(',');
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(batch)}&f=sd2t2ohlcvp&h&e=csv`;

  const resp = await fetch(url, {
    headers: STOOQ_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!resp.ok) throw new Error(`Stooq HTTP ${resp.status}`);
  const csv = await resp.text();
  const parsed = parseStooqCsv(csv);
  if (parsed.size === 0) throw new Error('Stooq returned empty data');
  return parsed;
}

// Yahoo Finance fallback — no crumb needed for v8 spark endpoint
async function fetchYahooFallback(): Promise<Map<string, { price: number; changePercent: number }>> {
  const yahooMap = [
    { yahoo: 'ES=F',  stooq: 'es.f' },
    { yahoo: 'NQ=F',  stooq: 'nq.f' },
    { yahoo: 'YM=F',  stooq: 'ym.f' },
    { yahoo: 'RTY=F', stooq: 'rty.f' },
    { yahoo: 'GC=F',  stooq: 'gc.f' },
    { yahoo: '^VIX',  stooq: '^vix' },
    { yahoo: 'NKD=F', stooq: 'nkd.f' },
  ];

  const symbols = yahooMap.map((m) => m.yahoo).join(',');
  const result = new Map<string, { price: number; changePercent: number }>();

  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const quotes = json?.quoteResponse?.result ?? [];
      if (quotes.length === 0) continue;
      for (const q of quotes) {
        const entry = yahooMap.find((m) => m.yahoo === q.symbol);
        if (entry && q.regularMarketPrice != null && q.regularMarketChangePercent != null) {
          result.set(entry.stooq, { price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent });
        }
      }
      if (result.size > 0) break;
    } catch {
      continue;
    }
  }
  return result;
}

let lastGood: FinvizResult<FinvizFuture> | null = null;
let lastFetchTs = 0;
const CACHE_TTL = 45_000;

export async function GET() {
  const now = new Date().toISOString();

  if (lastGood && Date.now() - lastFetchTs < CACHE_TTL) {
    return NextResponse.json(lastGood);
  }

  let quotes = new Map<string, { price: number; changePercent: number }>();
  let source = 'Stooq';
  let sourceError: string | undefined;

  try {
    quotes = await fetchStooq();
  } catch (stooqErr) {
    source = 'Yahoo Finance';
    try {
      quotes = await fetchYahooFallback();
    } catch (yahooErr) {
      sourceError = `Stooq: ${String(stooqErr)} | Yahoo: ${String(yahooErr)}`;
    }
  }

  const data: FinvizFuture[] = SYMBOLS.map((s) => {
    const q = quotes.get(s.stooq);
    const price = q?.price ?? null;
    const changePercent = q?.changePercent ?? null;
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

  if (hasData) {
    lastGood = { data, source, lastUpdated: now };
    lastFetchTs = Date.now();
    return NextResponse.json(lastGood);
  }

  if (lastGood) {
    return NextResponse.json({ ...lastGood, sourceError: 'Serving cached data — live fetch failed' });
  }

  return NextResponse.json({
    data,
    source,
    sourceError: sourceError ?? 'No data available',
    lastUpdated: now,
  });
}
