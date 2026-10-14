import { NextRequest, NextResponse } from 'next/server';
import { fetchTradierQuotes } from '@/lib/tradier';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));

  if (symbols.length > 50) {
    return NextResponse.json({ quotes: [], sourceError: 'Too many symbols (max 50).', lastUpdated: new Date().toISOString() }, { status: 400 });
  }

  const result = await fetchTradierQuotes(symbols);
  return NextResponse.json(result);
}
