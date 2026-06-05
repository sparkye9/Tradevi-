import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

let cache: { price: number; changePercent: number; ts: number } | null = null;
const TTL = 45_000;

async function fetchFromStooq(): Promise<{ price: number; changePercent: number }> {
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
  const chg = parseFloat(cols[8]);
  if (isNaN(price) || price <= 0) throw new Error('Invalid price');
  return { price, changePercent: isNaN(chg) ? 0 : chg };
}

async function fetchFromYahoo(): Promise<{ price: number; changePercent: number }> {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=%5EVIX&fields=regularMarketPrice,regularMarketChangePercent`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) continue;
      const json = await resp.json();
      const q = json?.quoteResponse?.result?.[0];
      if (q?.regularMarketPrice != null) {
        return { price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent ?? 0 };
      }
    } catch {
      continue;
    }
  }
  throw new Error('Yahoo Finance unavailable');
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
