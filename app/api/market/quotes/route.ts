import { NextResponse } from 'next/server';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';

export const runtime = 'nodejs';

interface QuoteResult {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  source: 'alpaca' | 'yahoo';
}

async function fetchAlpacaQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Alpaca credentials not configured');

  const url = `https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${symbols.join(',')}`;
  const res = await fetch(url, {
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}`);
  const json = await res.json();
  const quotes = json?.quotes ?? {};

  return symbols.map((sym) => {
    const q = quotes[sym];
    // Alpaca latest quote gives bid/ask; use mid as price proxy
    const price = q ? (q.ap + q.bp) / 2 : null;
    return { symbol: sym, price, changePercent: null, source: 'alpaca' as const };
  });
}

async function fetchYahooFallback(symbols: string[]): Promise<QuoteResult[]> {
  const quotes = await fetchYahooQuotes(symbols);
  const map: Record<string, typeof quotes[0]> = {};
  for (const q of quotes) map[q.symbol] = q;
  return symbols.map((sym) => {
    const q = map[sym];
    return {
      symbol: sym,
      price: q?.regularMarketPrice ?? null,
      changePercent: q?.regularMarketChangePercent ?? null,
      source: 'yahoo' as const,
    };
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('symbols') ?? '';
  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [], error: 'No symbols provided' });
  }

  try {
    const results = await fetchAlpacaQuotes(symbols);
    return NextResponse.json({ quotes: results, source: 'alpaca' });
  } catch {
    try {
      const results = await fetchYahooFallback(symbols);
      return NextResponse.json({ quotes: results, source: 'yahoo' });
    } catch (err) {
      return NextResponse.json(
        { quotes: symbols.map((sym) => ({ symbol: sym, price: null, changePercent: null, source: 'yahoo' })), error: String(err) },
        { status: 200 }
      );
    }
  }
}
