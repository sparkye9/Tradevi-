import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooNews } from '@/lib/yahooFinance';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() ?? 'SPY';

  try {
    const news = await fetchYahooNews(symbol);
    return NextResponse.json(
      { symbol, news, meta: { dataSource: 'yahoo_delayed', fetchedAt: new Date().toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Yahoo Finance unreachable';
    return NextResponse.json({ error: `Failed to fetch news: ${msg}` }, { status: 500 });
  }
}
