import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubQuote } from '@/lib/finnhub';
import { fetchTwelveQuote } from '@/lib/twelveData';
import { fetchYahooQuote } from '@/lib/yahooFinance';
import { fetchStooqQuote } from '@/lib/stooq';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // Try Finnhub first (real-time)
  if (process.env.FINNHUB_API_KEY) {
    try {
      const quote = await fetchFinnhubQuote(symbol);
      return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      // fall through
    }
  }

  // Try Twelve Data
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      const q = await fetchTwelveQuote(symbol);
      return NextResponse.json(q, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      // fall through
    }
  }

  // Yahoo Finance fallback — no API key required
  try {
    const raw = await fetchYahooQuote(symbol);
    const quote = {
      symbol: raw.symbol,
      price: raw.price,
      open: raw.regularMarketOpen ?? 0,
      high: raw.regularMarketDayHigh ?? 0,
      low: raw.regularMarketDayLow ?? 0,
      prevClose: raw.price - raw.change,
      change: raw.change,
      changePercent: raw.changePercent,
      volume: raw.volume,
      shortName: raw.shortName,
      dataSource: 'yahoo_delayed',
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // fall through
  }

  // Stooq — free, no API key, EOD data
  try {
    const quote = await fetchStooqQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Market data unavailable';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
