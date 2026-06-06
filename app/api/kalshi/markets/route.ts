import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const CACHE_TTL = 30_000; // 30 seconds

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  category: string;
  status: string;
}

// Module-level cache (same pattern as app/api/finviz/futures/route.ts)
let lastGoodMarkets: { markets: KalshiMarket[]; lastUpdated: string; count: number } | null = null;
let lastFetchTs = 0;

async function fetchAllOpenMarkets(): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ status: 'open', limit: '200' });
    if (cursor) params.set('cursor', cursor);

    const url = `${KALSHI_BASE}/markets?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) break;

    const json = await resp.json();
    const page: KalshiMarket[] = (json.markets ?? []).map((m: Record<string, unknown>) => ({
      ticker: m.ticker ?? '',
      event_ticker: m.event_ticker ?? '',
      series_ticker: m.series_ticker ?? '',
      title: m.title ?? '',
      yes_bid: m.yes_bid != null ? Number(m.yes_bid) : null,
      yes_ask: m.yes_ask != null ? Number(m.yes_ask) : null,
      no_bid: m.no_bid != null ? Number(m.no_bid) : null,
      no_ask: m.no_ask != null ? Number(m.no_ask) : null,
      last_price: m.last_price != null ? Number(m.last_price) : null,
      volume: Number(m.volume ?? 0),
      volume_24h: Number(m.volume_24h ?? 0),
      open_interest: Number(m.open_interest ?? 0),
      close_time: String(m.close_time ?? ''),
      category: String(m.category ?? ''),
      status: String(m.status ?? ''),
    }));

    allMarkets.push(...page);
    cursor = (json.cursor as string) ?? null;
  } while (cursor);

  return allMarkets;
}

export async function GET() {
  const now = new Date().toISOString();

  // Serve from cache if fresh
  if (lastGoodMarkets && Date.now() - lastFetchTs < CACHE_TTL) {
    return NextResponse.json(lastGoodMarkets);
  }

  try {
    const markets = await fetchAllOpenMarkets();

    if (markets.length > 0) {
      lastGoodMarkets = { markets, lastUpdated: now, count: markets.length };
      lastFetchTs = Date.now();
      return NextResponse.json(lastGoodMarkets);
    }

    // Empty — fall back to cache or return empty
    if (lastGoodMarkets) {
      return NextResponse.json({
        ...lastGoodMarkets,
        sourceError: 'Kalshi returned 0 markets — serving cached data',
      });
    }

    return NextResponse.json({ markets: [], lastUpdated: now, count: 0 });
  } catch (err) {
    if (lastGoodMarkets) {
      return NextResponse.json({
        ...lastGoodMarkets,
        sourceError: `Fetch failed: ${err instanceof Error ? err.message : 'unknown'} — serving cached data`,
      });
    }

    return NextResponse.json(
      { markets: [], lastUpdated: now, count: 0, sourceError: 'Kalshi data unavailable' },
      { status: 503 }
    );
  }
}
