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

async function fetchYahooFuturesFallback(): Promise<FinvizResult<FinvizFuture>> {
  const now = new Date().toISOString();
  const symbols = FUTURES_MAP.map((f) => f.yahoo).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!resp.ok) {
      return {
        data: [],
        source: 'Yahoo Finance (futures fallback)',
        sourceError: `Yahoo Finance futures HTTP ${resp.status}`,
        lastUpdated: now,
      };
    }
    const json = await resp.json();
    const quotes: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number }[] =
      json?.quoteResponse?.result ?? [];

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
        direction:
          changePercent === null
            ? null
            : changePercent > 0.05
            ? 'up'
            : changePercent < -0.05
            ? 'down'
            : 'flat',
        lastUpdated: now,
      };
    });

    return { data, source: 'Yahoo Finance (futures fallback)', lastUpdated: now };
  } catch (err) {
    return {
      data: [],
      source: 'Yahoo Finance (futures fallback)',
      sourceError: `Yahoo Finance futures fetch failed: ${String(err)}`,
      lastUpdated: now,
    };
  }
}

export async function GET() {
  const result = await fetchFinvizFutures();
  if (result.sourceError) {
    return NextResponse.json(await fetchYahooFuturesFallback());
  }
  return NextResponse.json(result);
}
