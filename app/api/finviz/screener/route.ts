import { NextRequest, NextResponse } from 'next/server';
import { fetchFinvizPublicScreener } from '@/lib/finviz-public';
import { fetchYahooScreener } from '@/lib/yahoo-screener';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ data: [], lastUpdated: new Date().toISOString() });
  }

  // Try Finviz public screener first (same approach as finvizfinance Python library)
  const finvizResult = await fetchFinvizPublicScreener(tickers);
  if (!finvizResult.blocked && !finvizResult.sourceError && finvizResult.data.length > 0) {
    return NextResponse.json(finvizResult);
  }

  // Fall back to Yahoo Finance
  const yahooResult = await fetchYahooScreener(tickers);
  return NextResponse.json({
    ...yahooResult,
    finvizError: finvizResult.sourceError,
  });
}
