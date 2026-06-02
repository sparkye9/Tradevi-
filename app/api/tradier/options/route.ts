import { NextRequest, NextResponse } from 'next/server';
import { fetchTradierOptions } from '@/lib/tradier';
import { fetchYahooOptions } from '@/lib/yahoo-fallback';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim() ?? '';
  if (!symbol) {
    return NextResponse.json({ contracts: [], sourceError: 'symbol required', lastUpdated: new Date().toISOString() });
  }

  const tradierResult = await fetchTradierOptions(symbol);
  if (!tradierResult.sourceError) {
    return NextResponse.json(tradierResult);
  }

  // Fall back to Yahoo Finance (no greeks, labeled delayed)
  const yahooResult = await fetchYahooOptions(symbol);
  return NextResponse.json({
    ...yahooResult,
    tradierError: tradierResult.sourceError,
  });
}
