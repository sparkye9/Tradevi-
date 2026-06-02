import { NextRequest, NextResponse } from 'next/server';
import { fetchFinvizScreener } from '@/lib/finviz';

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

  const result = await fetchFinvizScreener(tickers);
  return NextResponse.json(result);
}
