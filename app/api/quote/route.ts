import { NextRequest, NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/yahoo';
import { fetchCandles } from '@/lib/yahoo';
import { analyzeStock } from '@/lib/indicators';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const [quote, candles] = await Promise.all([
      fetchQuote(symbol),
      fetchCandles(symbol, '3mo', '1d'),
    ]);
    const analysis = analyzeStock(candles, symbol);
    return NextResponse.json({ quote, analysis }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 });
  }
}
