import { NextRequest, NextResponse } from 'next/server';
import { fetchMassiveQuote } from '@/lib/massiveFinance';
import { fetchYahooQuote } from '@/lib/yahooFinance';

export async function POST(request: NextRequest) {
  try {
    const { symbols } = await request.json();
    if (!Array.isArray(symbols)) return NextResponse.json({ error: 'symbols array required' }, { status: 400 });

    const fetchQuote = process.env.MASSIVE_API_KEY
      ? (s: string) => fetchMassiveQuote(s)
      : (s: string) => fetchYahooQuote(s);

    const results = await Promise.allSettled(
      symbols.slice(0, 20).map(s => fetchQuote(String(s).toUpperCase()))
    );

    const quotes: Record<string, object> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') quotes[symbols[i]] = r.value;
    });

    return NextResponse.json({ quotes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch watchlist data' }, { status: 500 });
  }
}
