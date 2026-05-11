import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionsChain } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const expiration = searchParams.get('expiration') ?? undefined;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const data = await fetchOptionsChain(symbol, expiration);
    return NextResponse.json(
      {
        ...data,
        meta: {
          dataSource: data.dataSource,
          fetchedAt: new Date().toISOString(),
          delayNote: 'Options data from Yahoo Finance is typically 15–20 min delayed. Always verify bid/ask in your broker before entering.',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to fetch options chain for ${symbol}: ${err?.message ?? 'Yahoo Finance unreachable'}` },
      { status: 503 }
    );
  }
}
