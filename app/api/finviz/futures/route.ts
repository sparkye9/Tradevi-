import { NextResponse } from 'next/server';
import { fetchFinvizFutures } from '@/lib/finviz';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

export const runtime = 'nodejs';

const FUTURES_MAP: { yahoo: string; symbol: string; name: string }[] = [
  { yahoo: 'ES=F',  symbol: 'ES',  name: 'S&P 500 Futures' },
  { yahoo: 'NQ=F',  symbol: 'NQ',  name: 'Nasdaq 100 Futures' },
  { yahoo: 'YM=F',  symbol: 'YM',  name: 'Dow Jones Futures' },
  { yahoo: 'RTY=F', symbol: 'RTY', name: 'Russell 2000 Futures' },
  { yahoo: 'NKD=F', symbol: 'NKD', name: 'Nikkei 225 Futures' },
];

// Last successful result — serves stale data if all live fetches fail
let lastGoodResult: FinvizResult<FinvizFuture> | null = null;

async function fetchYahooFutures(): Promise<FinvizResult<FinvizFuture>> {
  const now = new Date().toISOString();
  try {
    // Uses the same proven crumb-auth path as the screener (shared module)
    const quotes = await fetchYahooQuotes(FUTURES_MAP.map((f) => f.yahoo));

    if (quotes.length === 0) throw new Error('Empty response');

    const quoteMap: Record<string, typeof quotes[0]> = {};
    for (const q of quotes) quoteMap[q.symbol] = q;

    const data: FinvizFuture[] = FUTURES_MAP.map((f) => {
      const q = quoteMap[f.yahoo];
      const price = q?.regularMarketPrice ?? null;
      const changePercent = q?.regularMarketChangePercent ?? null;
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

    const result: FinvizResult<FinvizFuture> = { data, source: 'Yahoo Finance', lastUpdated: now };
    lastGoodResult = result;
    return result;
  } catch (err) {
    if (lastGoodResult) {
      return { ...lastGoodResult, sourceError: `Stale data — ${String(err)}` };
    }
    // Absolute fallback: return all symbols with null so the bar always renders
    return {
      data: FUTURES_MAP.map((f) => ({
        symbol: f.symbol, name: f.name, price: null, changePercent: null, direction: null, lastUpdated: now,
      })),
      source: 'Yahoo Finance',
      sourceError: `Futures unavailable: ${String(err)}`,
      lastUpdated: now,
    };
  }
}

export async function GET() {
  const finviz = await fetchFinvizFutures();
  if (!finviz.sourceError) {
    lastGoodResult = finviz;
    return NextResponse.json(finviz);
  }
  return NextResponse.json(await fetchYahooFutures());
}
