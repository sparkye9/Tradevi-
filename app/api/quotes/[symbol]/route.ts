import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubQuote } from '@/lib/finnhub';

export async function GET(
  _req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol.toUpperCase();
  try {
    const quote = await fetchFinnhubQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? `Failed to fetch quote for ${symbol}` },
      { status: 503 }
    );
  }
}
