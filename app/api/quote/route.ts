import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubQuote } from '@/lib/finnhub';
import { fetchYahooQuote } from '@/lib/yahooFinance';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    if (process.env.FINNHUB_API_KEY) {
      try {
        const quote = await fetchFinnhubQuote(symbol);
        return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
      } catch {
        // fall through to Yahoo Finance
      }
    }
    const quote = await fetchYahooQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `Failed to fetch quote for ${symbol}`;
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
