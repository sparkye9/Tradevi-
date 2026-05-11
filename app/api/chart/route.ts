import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const period = searchParams.get('period') ?? '3mo';
  const interval = searchParams.get('interval') ?? '1d';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const { candles, dataSource } = await fetchCandles(symbol, period, interval);
  return NextResponse.json(
    {
      symbol,
      candles,
      meta: {
        dataSource,
        fetchedAt: new Date().toISOString(),
        delayNote: dataSource === 'yahoo_delayed'
          ? 'Yahoo Finance chart data is typically 15–20 minutes delayed.'
          : 'DEMO DATA: Chart prices are approximate and not current market data.',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
