import { NextRequest, NextResponse } from 'next/server';
import { runScanner } from '@/lib/scanner';
import { fetchQuote } from '@/lib/yahoo';
import type { ScannerFilters } from '@/lib/types';

async function probeDataSource(): Promise<'yahoo_delayed' | 'mock'> {
  try {
    const q = await fetchQuote('SPY');
    return q._dataSource === 'yahoo_delayed' ? 'yahoo_delayed' : 'mock';
  } catch {
    return 'mock';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const filters = body as Partial<ScannerFilters>;
    const [result, dataSource] = await Promise.all([runScanner(filters), probeDataSource()]);
    return NextResponse.json(
      {
        ...result,
        meta: {
          dataSource,
          fetchedAt: new Date().toISOString(),
          delayNote: dataSource === 'yahoo_delayed'
            ? 'Options data from Yahoo Finance is typically 15–20 min delayed. Verify prices in your broker.'
            : 'DEMO DATA: Prices and options data shown are simulated. Do not use for real trading decisions.',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
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
    const [result, dataSource] = await Promise.all([
      runScanner({ maxPremium, optionType, tradeType }),
      probeDataSource(),
    ]);
    return NextResponse.json(
      { ...result, meta: { dataSource, fetchedAt: new Date().toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ error: 'Scanner failed' }, { status: 500 });
  }
}
