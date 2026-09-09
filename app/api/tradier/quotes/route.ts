import { NextRequest, NextResponse } from 'next/server';
import { fetchTradierQuotes } from '@/lib/tradier';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const result = await fetchTradierQuotes(symbols);
  return NextResponse.json(result);
}
