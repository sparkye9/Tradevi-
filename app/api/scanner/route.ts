import { NextRequest, NextResponse } from 'next/server';
import { runScanner } from '@/lib/scanner';
import type { ScannerFilters } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const filters = body as Partial<ScannerFilters>;
    const result = await runScanner(filters);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: 'Scanner failed', details: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const maxPremium = Number(searchParams.get('maxPremium') ?? 100);
  const optionType = (searchParams.get('optionType') as 'calls' | 'puts' | 'both') ?? 'both';
  const tradeType = (searchParams.get('tradeType') as 'day' | 'swing' | 'both') ?? 'both';

  try {
    const result = await runScanner({ maxPremium, optionType, tradeType });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Scanner failed' }, { status: 500 });
  }
}
