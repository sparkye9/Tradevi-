import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionsChain } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const expiration = searchParams.get('expiration') ?? undefined;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const data = await fetchOptionsChain(symbol, expiration);
  return NextResponse.json(
    {
      ...data,
      meta: {
        dataSource: data.dataSource,
        fetchedAt: new Date().toISOString(),
        delayNote: data.dataSource === 'yahoo_delayed'
          ? 'Options data is typically 15–20 min delayed. Always verify bid/ask in your broker before entering.'
          : 'DEMO DATA: Options prices shown are simulated, not real market quotes. Do not use for trading decisions.',
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
