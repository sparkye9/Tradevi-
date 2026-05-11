import { NextRequest, NextResponse } from 'next/server';
import { runScanner } from '@/lib/scanner';
import type { ScannerFilters } from '@/lib/types';

function safeJson(
  body: unknown,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let filters: Partial<ScannerFilters> = {};
  try {
    filters = await request.json().catch(() => ({})) as Partial<ScannerFilters>;
  } catch {
    // malformed body — use defaults
  }

  try {
    const result = await runScanner(filters);
    return safeJson({
      success: true,
      ...result,
      meta: {
        dataSource: 'yahoo_delayed',
        fetchedAt: new Date().toISOString(),
        delayNote: 'Options data is ~15-20 min delayed. Verify prices in your broker before trading.',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Market data temporarily unavailable';
    console.error('[Scanner API]', msg);
    return safeJson(
      { success: false, error: 'Market data temporarily unavailable', opportunities: [], results: [] },
      503,
    );
  }
}

export async function GET(request: NextRequest) {
  const sp         = new URL(request.url).searchParams;
  const maxPremium = Number(sp.get('maxPremium') ?? 100);
  const optionType = (sp.get('optionType') as 'calls' | 'puts' | 'both') ?? 'both';
  const tradeType  = (sp.get('tradeType')  as 'day' | 'swing' | 'both') ?? 'both';

  try {
    const result = await runScanner({ maxPremium, optionType, tradeType });
    return safeJson({
      success: true,
      ...result,
      meta: { dataSource: 'yahoo_delayed', fetchedAt: new Date().toISOString() },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Market data temporarily unavailable';
    console.error('[Scanner API GET]', msg);
    return safeJson(
      { success: false, error: 'Market data temporarily unavailable', opportunities: [], results: [] },
      503,
    );
  }
}
