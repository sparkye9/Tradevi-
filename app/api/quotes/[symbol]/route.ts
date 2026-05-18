import { NextRequest, NextResponse } from 'next/server';
import { fetchMassiveQuote } from '@/lib/massiveFinance';
import { fetchTwelveQuote } from '@/lib/twelveData';
import { fetchAlpacaQuote } from '@/lib/alpaca';
import { fetchYahooQuote } from '@/lib/yahooFinance';
import { fetchStooqQuote } from '@/lib/stooq';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  let lastError = '';

  // Try Massive first (real-time, requires MASSIVE_API_KEY)
  if (process.env.MASSIVE_API_KEY) {
    try {
      const raw = await fetchMassiveQuote(symbol);
      const quote = {
        symbol,
        price:         raw.price,
        open:          raw.regularMarketOpen    ?? 0,
        high:          raw.regularMarketDayHigh ?? 0,
        low:           raw.regularMarketDayLow  ?? 0,
        prevClose:     raw.price - raw.change,
        change:        raw.change,
        changePercent: raw.changePercent,
        volume:        raw.volume,
        shortName:     raw.shortName,
        dataSource:    'massive',
        fetchedAt:     new Date().toISOString(),
      };
      return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'Massive failed';
    }
  }

  // Try Twelve Data
  try {
    const quote = await fetchTwelveQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : 'Twelve Data failed';
  }

  // Try Alpaca as backup
  try {
    const quote = await fetchAlpacaQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : 'Alpaca failed';
  }

  // Try Yahoo Finance
  try {
    const raw = await fetchYahooQuote(symbol);
    const quote = {
      symbol:        raw.symbol,
      price:         raw.price,
      open:          raw.regularMarketOpen    ?? 0,
      high:          raw.regularMarketDayHigh ?? 0,
      low:           raw.regularMarketDayLow  ?? 0,
      prevClose:     raw.price - raw.change,
      change:        raw.change,
      changePercent: raw.changePercent,
      volume:        raw.volume,
      shortName:     raw.shortName,
      dataSource:    'yahoo_delayed',
      fetchedAt:     new Date().toISOString(),
    };
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : 'Yahoo failed';
  }

  // Try Stooq — free, no API key required (EOD data)
  try {
    const quote = await fetchStooqQuote(symbol);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stooq failed';
    return NextResponse.json(
      { error: `All providers failed: ${lastError}, ${msg}` },
      { status: 503 }
    );
  }
}
