import { NextRequest, NextResponse } from 'next/server';
import { fetchOptionChain } from '@/lib/optionChain';

export const runtime = 'nodejs';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase().trim();
  const expParam = req.nextUrl.searchParams.get('expiration');
  const expiration = expParam && DATE_RE.test(expParam) ? expParam : null;

  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json(
      { symbol, underlying: null, expirations: [], expiration: null, rows: [], hasGreeks: false, source: '', lastUpdated: new Date().toISOString(), sourceError: 'Enter a valid ticker symbol, like AAPL or SPY.' },
      { status: 400 },
    );
  }

  return NextResponse.json(await fetchOptionChain(symbol, expiration));
}
