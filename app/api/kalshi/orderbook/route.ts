import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const CACHE_TTL = 10_000; // 10 seconds, keyed by ticker

// Module-level cache keyed by ticker
const orderbookCache = new Map<string, { data: unknown; ts: number }>();

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) {
    return NextResponse.json({ error: 'Missing ?ticker= param' }, { status: 400 });
  }

  const cached = orderbookCache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = `${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}/orderbook`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Kalshi returned ${resp.status}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    orderbookCache.set(ticker, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (err) {
    // Return stale cache rather than error if available
    if (cached) {
      return NextResponse.json({ ...cached.data as object, stale: true });
    }
    return NextResponse.json(
      { error: `Orderbook fetch failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 503 }
    );
  }
}
