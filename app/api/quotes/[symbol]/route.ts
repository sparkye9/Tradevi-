import { NextRequest, NextResponse } from 'next/server';
import { fetchTwelveQuote } from '@/lib/twelveData';
import { fetchAlpacaQuote } from '@/lib/alpaca';
import { fetchYahooQuote } from '@/lib/yahoo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  let lastError = '';

  // Try Twelve Data first
  try {
    const quote = await fetchTwelveQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : 'Twelve Data failed';
  }

  // Try Alpaca as backup
  try {
    const quote = await fetchAlpacaQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : 'Alpaca failed';
  }

  // Try Yahoo as final fallback
  try {
    const quote = await fetchYahooQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Yahoo failed';
    return NextResponse.json(
      { error: `All providers failed: ${lastError}, ${msg}` },
      { status: 503 }
    );
  }
}
