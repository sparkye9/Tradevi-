import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';

function safeJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase();

  if (!symbol) {
    return safeJson(
      { success: false, error: 'symbol is required', expirations: [], calls: [], puts: [] },
      400,
    );
  }

  // Accept either ?date=<unix_timestamp> or ?expiration=<YYYY-MM-DD>
  const dateParam       = sp.get('date');
  const expirationParam = sp.get('expiration');

  let expiryArg: string | number | undefined;
  if (dateParam)       expiryArg = parseInt(dateParam, 10);
  else if (expirationParam) expiryArg = expirationParam;

  try {
    const data = await fetchYahooOptionsChain(symbol, expiryArg);

    return safeJson({
      success:         true,
      symbol,
      expirations:     data.expirationDates,   // alias expected by spec
      expirationDates: data.expirationDates,   // keep for backward compat
      calls:           data.calls,
      puts:            data.puts,
      underlyingPrice: data.underlyingPrice,
      meta: {
        dataSource: data.dataSource,
        fetchedAt:  new Date().toISOString(),
        delayNote:  'Options data ~15-20 min delayed. Verify bid/ask in your broker before entering.',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Options chain unavailable';
    console.error(`[options-chain] ${symbol}:`, msg);
    return safeJson(
      {
        success:         false,
        error:           'Options chain unavailable',
        symbol,
        expirations:     [],
        expirationDates: [],
        calls:           [],
        puts:            [],
        underlyingPrice: 0,
      },
      503,
    );
  }
}
