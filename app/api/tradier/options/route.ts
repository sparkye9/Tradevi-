import { NextRequest, NextResponse } from 'next/server';
import { fetchWebullOptions } from '@/lib/webull';
import { fetchYahooOptions } from '@/lib/yahoo-fallback';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim() ?? '';
  if (!symbol) {
    return NextResponse.json({ contracts: [], sourceError: 'symbol required', lastUpdated: new Date().toISOString() });
  }

  const webullResult = await fetchWebullOptions(symbol);
  if (!webullResult.sourceError) {
    return NextResponse.json(webullResult);
  }

  // Fall back to Yahoo Finance (no greeks, labeled delayed)
  const yahooResult = await fetchYahooOptions(symbol);
  return NextResponse.json({
    ...yahooResult,
    webullError: webullResult.sourceError,
  });
}
