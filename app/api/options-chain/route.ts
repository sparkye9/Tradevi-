import { NextRequest, NextResponse } from 'next/server';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase();

  if (!symbol) {
    return json({ success: false, error: 'symbol is required', expirations: [], calls: [], puts: [] }, 400);
  }

  const expiration = sp.get('expiration');
  let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  if (expiration) {
    const epoch = Math.floor(new Date(expiration).getTime() / 1000);
    url += `?date=${epoch}`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':     'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

    const text = await res.text();
    if (text.trimStart().startsWith('<')) throw new Error('Yahoo returned HTML');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any   = JSON.parse(text);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = data?.optionChain?.result?.[0];
    if (!result) throw new Error('No options data in response');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any          = result.options?.[0] ?? {};
    const rawDates: number[] = result.expirationDates ?? [];
    const expirations        = rawDates.map((ts: number) => new Date(ts * 1000).toISOString().split('T')[0]);
    const underlyingPrice: number = result.quote?.regularMarketPrice ?? 0;

    return json({
      success:         true,
      symbol,
      underlyingPrice,
      expirations,
      expirationDates: expirations,
      calls:           opts.calls ?? [],
      puts:            opts.puts  ?? [],
      meta: {
        dataSource: 'yahoo_delayed',
        fetchedAt:  new Date().toISOString(),
        delayNote:  'Options data ~15-20 min delayed.',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[options-chain] ${symbol}:`, msg);
    return json({
      success:         false,
      error:           'Options chain unavailable',
      expirations:     [],
      expirationDates: [],
      calls:           [],
      puts:            [],
    }, 503);
  }
}
