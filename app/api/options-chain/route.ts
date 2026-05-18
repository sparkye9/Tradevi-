import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';
import { analyzeOptionContract } from '@/lib/optionsAnalysis';

const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY;
const ALPHAVANTAGE_ENABLED = Boolean(ALPHAVANTAGE_API_KEY);
const ALPHAVANTAGE_BASE = 'https://www.alphavantage.co/query';

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

async function fetchAlphaVantageOptionsChain(symbol: string, expiration?: string | number) {
  if (!ALPHAVANTAGE_ENABLED) {
    throw new Error('Alpha Vantage API key is not configured.');
  }

  const expirationDate = expiration ? (toDateString(expiration) ?? String(expiration)) : null;

  // Options + quote in parallel (both count toward the 25 req/day free limit)
  const [optionsRes, quoteRes] = await Promise.all([
    fetch(
      `${ALPHAVANTAGE_BASE}?function=HISTORICAL_OPTIONS&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_API_KEY}`,
      { cache: 'no-store' }
    ),
    fetch(
      `${ALPHAVANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_API_KEY}`,
      { cache: 'no-store' }
    ),
  ]);

  if (!optionsRes.ok) {
    throw new Error(`Alpha Vantage request failed (${optionsRes.status})`);
  }

  const optionsJson = await optionsRes.json();

  // Surface rate-limit / plan messages as real errors
  if (optionsJson.Information || optionsJson.Note) {
    throw new Error(optionsJson.Information ?? optionsJson.Note);
  }

  const rawData: any[] = optionsJson.data ?? [];
  if (!rawData.length) {
    throw new Error(`No options data for ${symbol} from Alpha Vantage.`);
  }

  // Underlying price from quote endpoint
  let underlyingPrice = 0;
  if (quoteRes.ok) {
    const quoteJson = await quoteRes.json();
    underlyingPrice = Number(quoteJson?.['Global Quote']?.['05. price'] ?? 0);
  }

  // Collect unique expiration dates
  const expSet = new Set<string>();
  for (const item of rawData) {
    if (item.expiration) expSet.add(item.expiration);
  }
  const expirationDates = Array.from(expSet).sort();

  // Filter to the requested expiry (or the nearest one)
  const targetExpiry = expirationDate ?? expirationDates[0] ?? null;
  const filtered = targetExpiry
    ? rawData.filter(item => item.expiration === targetExpiry)
    : rawData;

  const parseContract = (item: any) => {
    const type: 'call' | 'put' = item.type === 'put' ? 'put' : 'call';
    const strike = Number(item.strike ?? 0);
    const bid    = Number(item.bid  ?? 0);
    const ask    = Number(item.ask  ?? 0);
    const expiry = item.expiration ?? targetExpiry ?? new Date().toISOString().split('T')[0];
    const dte    = calcDTE(expiry) ?? 0;
    const iv     = Number(item.implied_volatility ?? 0) || 0.3;

    // AV returns Greeks as strings — convert carefully
    const toGreek = (v: any) => (v !== undefined && v !== '' ? Number(v) : undefined);

    return analyzeOptionContract({
      contractSymbol: item.contractID ?? '',
      symbol:         item.symbol ?? symbol,
      strike,
      expiration: expiry,
      type,
      bid,
      ask,
      lastPrice:      Number(item.last ?? 0),
      volume:         Number(item.volume ?? 0),
      openInterest:   Number(item.open_interest ?? 0),
      impliedVolatility: iv,
      delta: toGreek(item.delta),
      gamma: toGreek(item.gamma),
      theta: toGreek(item.theta),
      vega:  toGreek(item.vega),
      inTheMoney: underlyingPrice > 0
        ? (type === 'call' ? underlyingPrice > strike : underlyingPrice < strike)
        : false,
      stockPrice: underlyingPrice,
      dte,
    });
  };

  const calls = filtered.filter(i => i.type === 'call').map(parseContract);
  const puts  = filtered.filter(i => i.type === 'put').map(parseContract);

  return { expirationDates, calls, puts, underlyingPrice, dataSource: 'alphavantage' as const };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol    = sp.get('symbol')?.toUpperCase()?.trim();
  const rawDate   = sp.get('date') ?? sp.get('expiration');
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

  let chain: any;
  let source = 'yahoo_delayed';

  try {
    chain  = await fetchYahooOptionsChain(symbol, dateParam);
    source = chain.dataSource ?? 'yahoo_delayed';
  } catch (yahooError) {
    if (ALPHAVANTAGE_ENABLED) {
      try {
        chain  = await fetchAlphaVantageOptionsChain(symbol, dateParam);
        source = 'alphavantage';
      } catch (avError) {
        const message = avError instanceof Error ? avError.message : 'Unknown Alpha Vantage error.';
        return safeJson({
          success: false,
          error: `Yahoo failed and Alpha Vantage fallback also failed: ${message}`,
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
          meta: { dataSource: 'alphavantage', fetchedAt: new Date().toISOString() },
        }, 503);
      }
    } else {
      const message = yahooError instanceof Error ? yahooError.message : 'Unknown Yahoo error.';
      return safeJson({
        success: false,
        error: `Yahoo failed and Alpha Vantage is not configured: ${message}`,
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
        meta: { dataSource: 'yahoo_delayed', fetchedAt: new Date().toISOString() },
      }, 503);
    }
  }

  const selectedExpiration = toDateString(dateParam) ?? chain.expirationDates?.[0] ?? null;
  const dte    = calcDTE(selectedExpiration);
  const ivAtm  = getNearestIV(chain.calls ?? [], chain.puts ?? [], chain.underlyingPrice ?? 0);
  const expectedMove = ivAtm !== null && dte !== null
    ? (chain.underlyingPrice ?? 0) * ivAtm * Math.sqrt(Math.max(dte, 1) / 365)
    : null;
  const totalCallVolume = (chain.calls ?? []).reduce((s: number, c: any) => s + (c.volume ?? 0), 0);
  const totalPutVolume  = (chain.puts  ?? []).reduce((s: number, c: any) => s + (c.volume ?? 0), 0);
  const putCallRatio    = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null;

  return safeJson({
    success: true,
    symbol,
    expirations:    chain.expirationDates ?? [],
    expirationDates: chain.expirationDates ?? [],
    selectedExpiration,
    dte,
    calls:           chain.calls ?? [],
    puts:            chain.puts  ?? [],
    underlyingPrice: chain.underlyingPrice ?? null,
    ivAtm,
    historicalVolatility: null,
    ivRank: null,
    expectedMove,
    putCallRatio,
    meta: {
      dataSource: source,
      fetchedAt: new Date().toISOString(),
    },
  });
}
