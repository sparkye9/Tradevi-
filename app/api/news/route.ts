import { NextRequest, NextResponse } from 'next/server';
import { fetchMassiveNews } from '@/lib/massiveFinance';
import { fetchYahooNews } from '@/lib/yahooFinance';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase() ?? 'SPY';

  if (process.env.MASSIVE_API_KEY) {
    try {
      const news = await fetchMassiveNews(symbol);
      return NextResponse.json(
        { symbol, news, meta: { dataSource: 'massive', fetchedAt: new Date().toISOString() } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      // fall through to Yahoo
    }
  }

  try {
    const news = await fetchYahooNews(symbol);
    return NextResponse.json(
      { symbol, news, meta: { dataSource: 'yahoo_delayed', fetchedAt: new Date().toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'News unavailable';
    return NextResponse.json(
      { symbol, news: [], error: msg, meta: { dataSource: 'none', fetchedAt: new Date().toISOString() } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
