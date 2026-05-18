import { NextRequest, NextResponse } from 'next/server';

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase()?.trim();
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  // Fetch 5-min candles over 5 days to capture multiple Asia sessions
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=5d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': YF_UA,
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Yahoo Finance ${res.status}` }, { status: 503 });
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    return NextResponse.json({ error: 'No data returned' }, { status: 503 });
  }

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens: number[]   = q.open   ?? [];
  const highs: number[]   = q.high   ?? [];
  const lows: number[]    = q.low    ?? [];
  const closes: number[]  = q.close  ?? [];
  const volumes: number[] = q.volume ?? [];

  const candles = timestamps
    .map((t, i) => ({
      time: t,
      open:   opens[i],
      high:   highs[i],
      low:    lows[i],
      close:  closes[i],
      volume: volumes[i] ?? 0,
    }))
    .filter(c => c.open != null && c.high != null && c.low != null && c.close != null);

  return NextResponse.json(
    {
      symbol,
      candles,
      currentPrice: result.meta?.regularMarketPrice ?? closes.at(-1) ?? 0,
      currency: result.meta?.currency ?? 'USD',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
