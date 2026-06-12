// app/api/options/yahoo/route.ts — Yahoo Finance options chain proxy
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionsChain } from '@/lib/options-fetcher';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const expiryStr = searchParams.get('expiry');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol param required' }, { status: 400 });
  }

  const expiryTs = expiryStr ? parseInt(expiryStr, 10) : undefined;
  const data = await fetchOptionsChain(symbol, expiryTs);

  return NextResponse.json(data);
}
