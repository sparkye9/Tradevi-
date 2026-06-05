import { NextResponse } from 'next/server';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';

export const runtime = 'nodejs';

// stooqAlt = Stooq index proxy if futures symbol not available
const SYMBOLS = [
  { stooq: 'es.f',  stooqAlt: '^spx',   yahoo: 'ES=F',   symbol: 'ES',  name: 'S&P 500 Futures' },
  { stooq: 'nq.f',  stooqAlt: '^ndx',   yahoo: 'NQ=F',   symbol: 'NQ',  name: 'Nasdaq 100 Futures' },
  { stooq: 'ym.f',  stooqAlt: '^dji',   yahoo: 'YM=F',   symbol: 'YM',  name: 'Dow Jones Futures' },
  { stooq: 'rty.f', stooqAlt: '^rut',   yahoo: 'RTY=F',  symbol: 'RTY', name: 'Russell 2000 Futures' },
  { stooq: 'gc.f',  stooqAlt: null,      yahoo: 'GC=F',   symbol: 'GC',  name: 'Gold Futures' },
  { stooq: '^vix',  stooqAlt: null,      yahoo: '^VIX',   symbol: 'VIX', name: 'CBOE Volatility Index' },
  { stooq: 'nkd.f', stooqAlt: '^nk225', yahoo: 'NKD=F',  symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchOneStooq(stooqSym: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    const encoded = stooqSym.replace('^', '%5E');
    // f=sd2t2ohlcvp: cols[6]=close, cols[8]=prevClose (p = prev close price, NOT % change)
    const url = `https://stooq.com/q/l/?s=${encoded}&f=sd2t2ohlcvp&h&e=csv`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain,*/*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    if (cols.length < 9) return null;
    const price = parseFloat(cols[6]);
    const prevClose = parseFloat(cols[8]);
    if (isNaN(price) || price <= 0) return null;
    const changePercent = (!isNaN(prevClose) && prevClose > 0)
      ? ((price - prevClose) / prevClose) * 100
      : 0;
    return { price, changePercent };
  } catch {
    return null;
  }
}

let lastGood: FinvizResult<FinvizFuture> | null = null;
let lastFetchTs = 0;
const CACHE_TTL = 45_000;

export async function GET() {
  const now = new Date().toISOString();

  if (lastGood && Date.now() - lastFetchTs < CACHE_TTL) {
    return NextResponse.json(lastGood);
  }

  // Phase 1: Stooq primary + alt in parallel
  const stooqResults = await Promise.all(
    SYMBOLS.map(async (s) => {
      const primary = await fetchOneStooq(s.stooq);
      if (primary) return primary;
      if (s.stooqAlt) return fetchOneStooq(s.stooqAlt);
      return null;
    })
  );

  // Phase 2: batch Yahoo Finance (crumb-based) for any that failed
  const failedIdxs = stooqResults.map((r, i) => r === null ? i : -1).filter((i) => i >= 0);
  let yahooMap: Map<string, { price: number; changePercent: number }> = new Map();

  if (failedIdxs.length > 0) {
    const yahooSyms = failedIdxs.map((i) => SYMBOLS[i].yahoo);
    try {
      const quotes = await fetchYahooQuotes(yahooSyms);
      for (const q of quotes) {
        if (q.regularMarketPrice != null) {
          yahooMap.set(q.symbol.toUpperCase(), {
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent ?? 0,
          });
        }
      }
    } catch {
      // Yahoo failed too — will serve nulls or cached data
    }
  }

  const data: FinvizFuture[] = SYMBOLS.map((s, i) => {
    const result = stooqResults[i] ?? yahooMap.get(s.yahoo.toUpperCase()) ?? null;
    const { price, changePercent } = result ?? { price: null, changePercent: null };
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
    return NextResponse.json({
      ...lastGood,
      sourceError: `Live fetch failed (${successCount}/${SYMBOLS.length}) — serving cached data`,
    });
  }

  return NextResponse.json({
    data,
    source: 'Stooq / Yahoo Finance',
    sourceError: 'All data sources unavailable',
    lastUpdated: now,
  });
}
