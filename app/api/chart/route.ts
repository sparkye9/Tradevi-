import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const period = searchParams.get('period') ?? '3mo';
  const interval = searchParams.get('interval') ?? '1d';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const candles = await fetchCandles(symbol, period, interval);
    return NextResponse.json({ symbol, candles }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
  }
}
