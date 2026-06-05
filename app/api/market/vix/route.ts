import { NextResponse } from 'next/server';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';

export const runtime = 'nodejs';

export async function GET() {
  const now = new Date().toISOString();
  try {
    const quotes = await fetchYahooQuotes(['^VIX']);
    const q = quotes[0];
    if (!q) throw new Error('No VIX data returned');
    return NextResponse.json({
      price: q.regularMarketPrice ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      lastUpdated: now,
    });
  } catch (err) {
    return NextResponse.json(
      { price: null, changePercent: null, lastUpdated: now, error: String(err) },
      { status: 200 }
    );
  }
}
