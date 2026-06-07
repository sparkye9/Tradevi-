import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string[] | string;
  outcomes: string[] | string;
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  tags?: { label: string }[];
}

let cache: { data: PolymarketMarket[]; ts: number } | null = null;
const TTL = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ data: cache.data, source: 'Polymarket' });
  }

  try {
    const resp = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=500',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) throw new Error(`Polymarket HTTP ${resp.status}`);
    const raw: PolymarketMarket[] = await resp.json();

    const data = raw.filter((m) => {
      try {
        const prices = typeof m.outcomePrices === 'string'
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices;
        return Array.isArray(prices) && prices.length === 2;
      } catch {
        return false;
      }
    });

    cache = { data, ts: Date.now() };
    return NextResponse.json({ data, source: 'Polymarket' });
  } catch (err) {
    if (cache) {
      return NextResponse.json({ data: cache.data, source: 'Polymarket (cached)', warning: String(err) });
    }
    return NextResponse.json({ data: [], source: 'Polymarket', error: String(err) }, { status: 200 });
  }
}
