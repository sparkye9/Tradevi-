import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionsChain } from '@/lib/yahoo';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const expiration = searchParams.get('expiration') ?? undefined;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const data = await fetchOptionsChain(symbol, expiration);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch options chain' }, { status: 500 });
  }
}
