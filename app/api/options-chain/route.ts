import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';

function safeJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function toDateString(value?: string | number): string | null {
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return null;
}

function calcDTE(expiration: string | null): number | null {
  if (!expiration) return null;
  const expiryMs = new Date(`${expiration}T16:00:00Z`).getTime();
  return Number.isFinite(expiryMs)
    ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 86_400_000))
    : null;
}

function getNearestIV(calls: any[], puts: any[], price: number): number | null {
  const all = [...calls, ...puts];
  let best: { diff: number; iv: number | null } = { diff: Number.POSITIVE_INFINITY, iv: null };
  all.forEach((c) => {
    const iv = typeof c.impliedVolatility === 'number' ? c.impliedVolatility : null;
    if (iv === null) return;
    const diff = Math.abs((c.strike ?? 0) - price);
    if (diff < best.diff) best = { diff, iv };
  });
  return best.iv;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase()?.trim();
  const rawDate = sp.get('date') ?? sp.get('expiration');
  const dateParam = rawDate ? (Number.isFinite(Number(rawDate)) ? Number(rawDate) : rawDate) : undefined;

  if (!symbol) {
    return safeJson({
      success: false,
      error: 'Missing symbol query parameter.',
      symbol: undefined,
      expirations: [],
      expirationDates: [],
      calls: [],
      puts: [],
      underlyingPrice: null,
      ivAtm: null,
      historicalVolatility: null,
      ivRank: null,
      expectedMove: null,
      putCallRatio: null,
      selectedExpiration: null,
      dte: null,
      meta: { dataSource: 'yahoo_delayed', fetchedAt: new Date().toISOString() },
    }, 400);
  }

  try {
    const chain = await fetchYahooOptionsChain(symbol, dateParam);
    const selectedExpiration = toDateString(dateParam) ?? chain.expirationDates[0] ?? null;
    const dte = calcDTE(selectedExpiration);
    const ivAtm = getNearestIV(chain.calls, chain.puts, chain.underlyingPrice);
    const expectedMove = ivAtm !== null && dte !== null
      ? chain.underlyingPrice * ivAtm * Math.sqrt(Math.max(dte, 1) / 365)
      : null;
    const totalCallVolume = chain.calls.reduce((sum, c) => sum + (c.volume ?? 0), 0);
    const totalPutVolume = chain.puts.reduce((sum, c) => sum + (c.volume ?? 0), 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null;

    return safeJson({
      success: true,
      symbol,
      expirations: chain.expirationDates,
      expirationDates: chain.expirationDates,
      selectedExpiration,
      dte,
      calls: chain.calls,
      puts: chain.puts,
      underlyingPrice: chain.underlyingPrice,
      ivAtm,
      historicalVolatility: null,
      ivRank: null,
      expectedMove,
      putCallRatio,
      meta: {
        dataSource: chain.dataSource,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load options chain';
    return safeJson({
      success: false,
      error: message,
      symbol,
      expirations: [],
      expirationDates: [],
      calls: [],
      puts: [],
      underlyingPrice: null,
      ivAtm: null,
      historicalVolatility: null,
      ivRank: null,
      expectedMove: null,
      putCallRatio: null,
      selectedExpiration: null,
      dte: null,
      meta: {
        dataSource: 'yahoo_delayed',
        fetchedAt: new Date().toISOString(),
      },
    }, 503);
  }
}
