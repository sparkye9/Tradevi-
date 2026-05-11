import { NextRequest, NextResponse } from 'next/server';
import { fetchQuote, fetchCandles } from '@/lib/yahoo';
import { analyzeStock } from '@/lib/indicators';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const [quote, { candles, dataSource: candleSource }] = await Promise.all([
    fetchQuote(symbol),
    fetchCandles(symbol, '3mo', '1d'),
  ]);
  const analysis = analyzeStock(candles, symbol);

  // Use the most pessimistic source (mock > delayed)
  const dataSource = quote._dataSource === 'mock' || candleSource === 'mock' ? 'mock' : 'yahoo_delayed';

  return NextResponse.json(
    {
      quote,
      analysis,
      meta: {
        dataSource,
        fetchedAt: new Date().toISOString(),
        delayNote: dataSource === 'yahoo_delayed'
          ? 'Yahoo Finance data is typically 15–20 minutes delayed. Prices may differ from your broker.'
          : 'DEMO DATA: Yahoo Finance is unreachable. Prices shown are NOT current market prices. Do not use for trading decisions.',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
