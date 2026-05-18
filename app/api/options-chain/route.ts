import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';
import { analyzeOptionContract } from '@/lib/optionsAnalysis';

const TRADIER_TOKEN = process.env.TRADIER_TOKEN;
const TRADIER_ENABLED = Boolean(TRADIER_TOKEN);
const TRADIER_BASE_URL = (process.env.TRADIER_API_URL ?? 'https://api.tradier.com/v1').replace(/\/$/, '');

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

async function fetchTradierOptionsChain(symbol: string, expiration?: string | number) {
  if (!TRADIER_ENABLED) {
    throw new Error('Tradier token is not configured.');
  }

  const headers = {
    Authorization: `Bearer ${TRADIER_TOKEN}`,
    Accept: 'application/json',
  };

  const expirationDate = expiration ? (toDateString(expiration) ?? String(expiration)) : null;

  // Fetch expiration dates and underlying quote in parallel
  const [expirationsRes, quoteRes] = await Promise.all([
    fetch(`${TRADIER_BASE_URL}/markets/options/expirations?symbol=${encodeURIComponent(symbol)}&includeAllRoots=true`, {
      headers,
      cache: 'no-store',
    }),
    fetch(`${TRADIER_BASE_URL}/markets/quotes?symbols=${encodeURIComponent(symbol)}&greeks=false`, {
      headers,
      cache: 'no-store',
    }),
  ]);

  if (!expirationsRes.ok) {
    const text = await expirationsRes.text().catch(() => '');
    throw new Error(`Tradier request failed (${expirationsRes.status}) ${text}`);
  }
  if (!quoteRes.ok) {
    const text = await quoteRes.text().catch(() => '');
    throw new Error(`Tradier quote request failed (${quoteRes.status}) ${text}`);
  }

  const expirationsJson = await expirationsRes.json();
  const quoteJson = await quoteRes.json();

  const rawDates = expirationsJson?.expirations?.date ?? [];
  const expirationDates: string[] = Array.isArray(rawDates) ? rawDates : (rawDates ? [rawDates] : []);

  const quote = quoteJson?.quotes?.quote;
  const underlyingPrice = Number(quote?.last ?? quote?.close ?? 0);

  const targetExpiration = expirationDate ?? expirationDates[0] ?? null;
  if (!targetExpiration) {
    return { expirationDates, calls: [], puts: [], underlyingPrice, dataSource: 'tradier' as const };
  }

  const chainRes = await fetch(
    `${TRADIER_BASE_URL}/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${targetExpiration}&greeks=true`,
    { headers, cache: 'no-store' }
  );

  if (!chainRes.ok) {
    const text = await chainRes.text().catch(() => '');
    throw new Error(`Tradier chain request failed (${chainRes.status}) ${text}`);
  }

  const chainJson = await chainRes.json();
  const rawOptions = chainJson?.options?.option ?? [];
  const options: any[] = Array.isArray(rawOptions) ? rawOptions : (rawOptions ? [rawOptions] : []);

  const parseContract = (item: any) => {
    const type: 'call' | 'put' = item.option_type === 'put' ? 'put' : 'call';
    const bid = Number(item.bid ?? 0);
    const ask = Number(item.ask ?? 0);
    const expiry = item.expiration_date ?? targetExpiration;
    const dte = calcDTE(expiry) ?? 0;
    const iv = Number(item.greeks?.mid_iv ?? item.greeks?.smv_vol ?? 0) || 0.3;
    const strike = Number(item.strike ?? 0);

    return analyzeOptionContract({
      contractSymbol: item.symbol ?? '',
      symbol: item.root_symbol ?? symbol,
      strike,
      expiration: expiry,
      type,
      bid,
      ask,
      lastPrice: Number(item.last ?? 0),
      volume: Number(item.volume ?? 0),
      openInterest: Number(item.open_interest ?? 0),
      impliedVolatility: iv,
      delta: typeof item.greeks?.delta === 'number' ? item.greeks.delta : undefined,
      gamma: typeof item.greeks?.gamma === 'number' ? item.greeks.gamma : undefined,
      theta: typeof item.greeks?.theta === 'number' ? item.greeks.theta : undefined,
      vega: typeof item.greeks?.vega === 'number' ? item.greeks.vega : undefined,
      inTheMoney: underlyingPrice > 0
        ? (type === 'call' ? underlyingPrice > strike : underlyingPrice < strike)
        : false,
      stockPrice: underlyingPrice,
      dte,
    });
  };

  const calls = options.filter(o => o.option_type === 'call').map(parseContract);
  const puts = options.filter(o => o.option_type === 'put').map(parseContract);

  return { expirationDates, calls, puts, underlyingPrice, dataSource: 'tradier' as const };
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
    if (TRADIER_ENABLED) {
      try {
        chain = await fetchTradierOptionsChain(symbol, dateParam);
        source = 'tradier';
      } catch (tradierError) {
        const message = tradierError instanceof Error ? tradierError.message : 'Unable to load options chain from Tradier.';
        return safeJson({
          success: false,
          error: `Yahoo failed and Tradier fallback also failed: ${message}`,
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
          meta: { dataSource: 'tradier', fetchedAt: new Date().toISOString() },
        }, 503);
      }
    } else {
      const message = yahooError instanceof Error ? yahooError.message : 'Unable to load options chain from Yahoo.';
      return safeJson({
        success: false,
        error: `Yahoo failed and Tradier is not configured: ${message}`,
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
  const totalPutVolume = (chain.puts ?? []).reduce((sum: number, c: any) => sum + (c.volume ?? 0), 0);
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
