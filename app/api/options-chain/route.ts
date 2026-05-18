import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';
import { analyzeOptionContract } from '@/lib/optionsAnalysis';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_ENABLED = Boolean(POLYGON_API_KEY);
const POLYGON_BASE = 'https://api.polygon.io';

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

async function fetchPolygonOptionsChain(symbol: string, expiration?: string | number) {
  if (!POLYGON_ENABLED) {
    throw new Error('Polygon API key is not configured.');
  }

  const expirationDate = expiration ? (toDateString(expiration) ?? String(expiration)) : null;

  const params = new URLSearchParams({
    apiKey: POLYGON_API_KEY!,
    limit: '250',
    order: 'asc',
    sort: 'strike_price',
  });
  if (expirationDate) params.set('expiration_date', expirationDate);

  // Paginate up to 2 pages (500 contracts) to stay within free-tier rate limits
  let results: any[] = [];
  let nextUrl: string | null =
    `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(symbol)}?${params}`;
  let underlyingPrice = 0;
  let pages = 0;

  while (nextUrl && pages < 2) {
    const res = await fetch(nextUrl, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Polygon request failed (${res.status}) ${text}`);
    }
    const json = await res.json();
    if (json.status === 'ERROR') {
      throw new Error(`Polygon error: ${json.error ?? json.message ?? 'unknown'}`);
    }
    results = results.concat(json.results ?? []);
    underlyingPrice = json.underlying_asset?.price ?? underlyingPrice;
    nextUrl = json.next_url ? `${json.next_url}&apiKey=${POLYGON_API_KEY}` : null;
    pages++;
  }

  // Collect unique expiration dates from results
  const expSet = new Set<string>();
  for (const r of results) {
    const exp = r.details?.expiration_date;
    if (exp) expSet.add(exp);
  }
  const expirationDates = Array.from(expSet).sort();

  // When no expiry was requested, narrow to the nearest expiry only
  const targetExpiry = expirationDate ?? expirationDates[0] ?? null;
  const filtered = expirationDate
    ? results
    : results.filter(r => r.details?.expiration_date === targetExpiry);

  const parseContract = (item: any) => {
    const details = item.details ?? {};
    const greeks = item.greeks ?? {};
    const day = item.day ?? {};
    const lastQuote = item.last_quote ?? {};

    const type: 'call' | 'put' = details.contract_type === 'put' ? 'put' : 'call';
    const strike = Number(details.strike_price ?? 0);
    const bid = Number(lastQuote.bid ?? 0);
    const ask = Number(lastQuote.ask ?? 0);
    const expiry = details.expiration_date ?? targetExpiry ?? new Date().toISOString().split('T')[0];
    const dte = calcDTE(expiry) ?? 0;
    const iv = Number(item.implied_volatility ?? 0) || 0.3;

    return analyzeOptionContract({
      contractSymbol: details.ticker ?? '',
      symbol: details.underlying_ticker ?? symbol,
      strike,
      expiration: expiry,
      type,
      bid,
      ask,
      lastPrice: Number(lastQuote.midpoint ?? day.close ?? 0),
      volume: Number(day.volume ?? 0),
      openInterest: Number(item.open_interest ?? 0),
      impliedVolatility: iv,
      delta: typeof greeks.delta === 'number' ? greeks.delta : undefined,
      gamma: typeof greeks.gamma === 'number' ? greeks.gamma : undefined,
      theta: typeof greeks.theta === 'number' ? greeks.theta : undefined,
      vega: typeof greeks.vega === 'number' ? greeks.vega : undefined,
      inTheMoney: underlyingPrice > 0
        ? (type === 'call' ? underlyingPrice > strike : underlyingPrice < strike)
        : false,
      stockPrice: underlyingPrice,
      dte,
    });
  };

  const calls = filtered.filter(r => r.details?.contract_type === 'call').map(parseContract);
  const puts  = filtered.filter(r => r.details?.contract_type === 'put').map(parseContract);

  return { expirationDates, calls, puts, underlyingPrice, dataSource: 'polygon' as const };
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

  let chain: any;
  let source = 'yahoo_delayed';

  try {
    chain = await fetchYahooOptionsChain(symbol, dateParam);
    source = chain.dataSource ?? 'yahoo_delayed';
  } catch (yahooError) {
    if (POLYGON_ENABLED) {
      try {
        chain = await fetchPolygonOptionsChain(symbol, dateParam);
        source = 'polygon';
      } catch (polygonError) {
        const message = polygonError instanceof Error ? polygonError.message : 'Unknown Polygon error.';
        return safeJson({
          success: false,
          error: `Yahoo failed and Polygon fallback also failed: ${message}`,
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
          meta: { dataSource: 'polygon', fetchedAt: new Date().toISOString() },
        }, 503);
      }
    } else {
      const message = yahooError instanceof Error ? yahooError.message : 'Unknown Yahoo error.';
      return safeJson({
        success: false,
        error: `Yahoo failed and Polygon is not configured: ${message}`,
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
  const dte = calcDTE(selectedExpiration);
  const ivAtm = getNearestIV(chain.calls ?? [], chain.puts ?? [], chain.underlyingPrice ?? 0);
  const expectedMove = ivAtm !== null && dte !== null
    ? (chain.underlyingPrice ?? 0) * ivAtm * Math.sqrt(Math.max(dte, 1) / 365)
    : null;
  const totalCallVolume = (chain.calls ?? []).reduce((sum: number, c: any) => sum + (c.volume ?? 0), 0);
  const totalPutVolume  = (chain.puts  ?? []).reduce((sum: number, c: any) => sum + (c.volume ?? 0), 0);
  const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : null;

  return safeJson({
    success: true,
    symbol,
    expirations: chain.expirationDates ?? [],
    expirationDates: chain.expirationDates ?? [],
    selectedExpiration,
    dte,
    calls: chain.calls ?? [],
    puts: chain.puts ?? [],
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
