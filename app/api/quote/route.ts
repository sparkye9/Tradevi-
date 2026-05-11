import { NextRequest, NextResponse } from 'next/server';
import { fetchQuote, fetchCandles } from '@/lib/yahoo';
import { analyzeStock } from '@/lib/indicators';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const [quote, { candles }] = await Promise.all([
      fetchQuote(symbol),
      fetchCandles(symbol, '3mo', '1d'),
    ]);
    const analysis = analyzeStock(candles, symbol);
    return NextResponse.json(
      {
        quote,
        analysis,
        meta: {
          dataSource: 'yahoo_delayed',
          fetchedAt: new Date().toISOString(),
          delayNote: 'Yahoo Finance data is typically 15–20 minutes delayed. Always verify in your broker before trading.',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to fetch live data for ${symbol}: ${err?.message ?? 'Yahoo Finance unreachable'}` },
      { status: 503 }
    );
  }
}
