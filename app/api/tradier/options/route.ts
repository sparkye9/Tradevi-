import { NextRequest, NextResponse } from 'next/server';
import { fetchTradierOptions } from '@/lib/tradier';
import { fetchYahooOptions } from '@/lib/yahoo-fallback';
import type { TradierOptionsFilter } from '@/lib/tradier';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim() ?? '';
  if (!symbol) {
    return NextResponse.json({ contracts: [], sourceError: 'symbol required', lastUpdated: new Date().toISOString() });
  }

  // ?cheap=true → delta >= 0.29, mid $0.10–$0.50 (contract cost $10–$50)
  const cheap = req.nextUrl.searchParams.get('cheap') === 'true';
  const filter: TradierOptionsFilter = cheap
    ? { minDelta: 0.29, maxDelta: 0.85, minMid: 0.10, maxMid: 0.50 }
    : {};

  const tradierResult = await fetchTradierOptions(symbol, filter);
  if (!tradierResult.sourceError) {
    return NextResponse.json(tradierResult);
  }

  const yahooResult = await fetchYahooOptions(symbol);
  return NextResponse.json({ ...yahooResult, tradierError: tradierResult.sourceError });
}
