import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooCandles } from '@/lib/yahooChart';

// Legacy route — redirects to /api/charts/[symbol] pattern.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const period = searchParams.get('period') ?? '3mo';
  const interval = searchParams.get('interval') ?? '1d';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const { candles, dataSource } = await fetchYahooCandles(symbol, period, interval);
    return NextResponse.json(
      { symbol, candles, meta: { dataSource, fetchedAt: new Date().toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chart data unavailable';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
