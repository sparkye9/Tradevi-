import { NextResponse } from 'next/server';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';

export const runtime = 'nodejs';

let cache: { price: number; changePercent: number; ts: number } | null = null;
const TTL = 45_000;

async function fetchFromStooq(): Promise<{ price: number; changePercent: number }> {
  // f=sd2t2ohlcvp: cols[6]=close, cols[8]=prevClose (p = prev close price, NOT %)
  const url = 'https://stooq.com/q/l/?s=%5Evix&f=sd2t2ohlcvp&h&e=csv';
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`Stooq HTTP ${resp.status}`);
  const text = await resp.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Empty response');
  const cols = lines[1].split(',');
  const price = parseFloat(cols[6]);
  const prevClose = parseFloat(cols[8]);
  if (isNaN(price) || price <= 0) throw new Error('Invalid price');
  const changePercent = (!isNaN(prevClose) && prevClose > 0)
    ? ((price - prevClose) / prevClose) * 100
    : 0;
  return { price, changePercent };
}

async function fetchFromYahoo(): Promise<{ price: number; changePercent: number }> {
  const quotes = await fetchYahooQuotes(['^VIX']);
  const q = quotes.find((r) => r.symbol === '^VIX' || r.symbol === 'VIX');
  if (q?.regularMarketPrice != null) {
    return { price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent ?? 0 };
  }
  throw new Error('VIX not in Yahoo response');
}

export async function GET() {
  const now = new Date().toISOString();

  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ price: cache.price, changePercent: cache.changePercent, lastUpdated: now });
  }

  try {
    const data = await fetchFromStooq();
    cache = { ...data, ts: Date.now() };
    return NextResponse.json({ ...data, lastUpdated: now });
  } catch {
    try {
      const data = await fetchFromYahoo();
      cache = { ...data, ts: Date.now() };
      return NextResponse.json({ ...data, lastUpdated: now });
    } catch (err) {
      return NextResponse.json(
        { price: null, changePercent: null, lastUpdated: now, error: String(err) },
        { status: 200 }
      );
    }
  }
}
