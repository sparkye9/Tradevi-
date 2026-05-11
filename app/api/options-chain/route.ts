import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol     = searchParams.get('symbol')?.toUpperCase();
  const expiration = searchParams.get('expiration') ?? undefined;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const data = await fetchYahooOptionsChain(symbol, expiration);
    return NextResponse.json(
      {
        ...data,
        meta: {
          dataSource: data.dataSource,
          fetchedAt: new Date().toISOString(),
          delayNote: 'Options data from Yahoo Finance is ~15-20 min delayed. Always verify bid/ask in your broker before entering.',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Yahoo Finance unreachable';
    return NextResponse.json(
      { error: `Failed to fetch options chain for ${symbol}: ${msg}` },
      { status: 503 },
    );
  }
}
