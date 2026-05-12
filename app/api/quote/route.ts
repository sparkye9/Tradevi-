import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubQuote } from '@/lib/finnhub';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    if (!process.env.FINNHUB_API_KEY) {
      return NextResponse.json(
        { error: 'Market data unavailable — API key required' },
        { status: 503 },
      );
    }

    const quote = await fetchFinnhubQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Market data unavailable — API key required';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
