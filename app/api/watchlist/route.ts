import { NextRequest, NextResponse } from 'next/server';
import { fetchMultipleQuotes } from '@/lib/yahoo';

export async function POST(request: NextRequest) {
  try {
    const { symbols } = await request.json();
    if (!Array.isArray(symbols)) return NextResponse.json({ error: 'symbols array required' }, { status: 400 });

    const quotes = await fetchMultipleQuotes(symbols.slice(0, 20));
    return NextResponse.json({ quotes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch watchlist data' }, { status: 500 });
  }
}
