import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooOptionsChain } from '@/lib/yahooFinance';
import { analyzeOptionContract } from '@/lib/optionsAnalysis';

const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL?.replace(/\/$/, '') ?? 'https://data.alpaca.markets';
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
const ALPACA_ENABLED = Boolean(ALPACA_API_KEY && ALPACA_SECRET_KEY);

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

async function fetchAlpacaOptionsChain(symbol: string, expiration?: string | number) {
  if (!ALPACA_ENABLED) {
    throw new Error('Alpaca credentials are not configured.');
  }

  const url = new URL(`${ALPACA_BASE_URL}/v2/options/chains`);
  url.searchParams.set('underlying_symbol', symbol);
  url.searchParams.set('limit', '500');
  if (expiration) {
    const dateString = toDateString(expiration) ?? String(expiration);
    url.searchParams.set('expiration_date', dateString);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': ALPACA_API_KEY ?? '',
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY ?? '',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Alpaca request failed (${response.status}) ${text}`);
  }

  const json = await response.json();
  const chain = Array.isArray(json.chains) ? json.chains[0] : json.chain ?? json;
  if (!chain || !Array.isArray(chain.calls) || !Array.isArray(chain.puts)) {
    throw new Error('Invalid Alpaca options response format.');
  }

  const underlyingPrice = Number(chain.underlying_price ?? chain.underlyingPrice ?? 0);

  const parseContract = (item: any, type: 'call' | 'put') => {
    const bid = Number(item.bid_price ?? item.bid ?? 0);
    const ask = Number(item.ask_price ?? item.ask ?? 0);
    const expiration = toDateString(item.expiration_date ?? item.expiration ?? item.expirationDate) ?? new Date().toISOString().split('T')[0];
    const dte = calcDTE(expiration) ?? 0;

    return analyzeOptionContract({
      contractSymbol: item.symbol ?? item.contract_symbol ?? item.contractSymbol ?? '',
      symbol: item.underlying_symbol ?? '',
      strike: Number(item.strike_price ?? item.strike ?? 0),
      expiration,
      type,
      bid,
      ask,
      lastPrice: Number(item.last_trade_price ?? item.last_price ?? item.last ?? 0),
      volume: Number(item.volume ?? 0),
      openInterest: Number(item.open_interest ?? item.openInterest ?? 0),
      impliedVolatility: Number(item.implied_volatility ?? item.impliedVolatility ?? item.iv ?? 0) || 0.3,
      delta: typeof item.delta === 'number' ? item.delta : undefined,
      gamma: typeof item.gamma === 'number' ? item.gamma : undefined,
      theta: typeof item.theta === 'number' ? item.theta : undefined,
      inTheMoney: Boolean(item.in_the_money ?? item.inTheMoney ?? false),
      stockPrice: underlyingPrice,
      dte,
    });
  };

  return {
    expirationDates: chain.expiration_dates ?? chain.expirations ?? [],
    calls: chain.calls.map((item: any) => parseContract(item, 'call')),
    puts: chain.puts.map((item: any) => parseContract(item, 'put')),
    underlyingPrice,
    dataSource: 'alpaca',
  };
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
  } catch (baseError) {
    if (ALPACA_ENABLED) {
      try {
        chain = await fetchAlpacaOptionsChain(symbol, dateParam);
        source = 'alpaca';
      } catch (alpacaError) {
        const message = alpacaError instanceof Error ? alpacaError.message : 'Unable to load options chain from Alpaca fallback.';
        return safeJson({
          success: false,
          error: `Yahoo failed and Alpaca fallback also failed: ${message}`,
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
          meta: { dataSource: 'alpaca', fetchedAt: new Date().toISOString() },
        }, 503);
      }
    } else {
      const message = baseError instanceof Error ? baseError.message : 'Unable to load options chain from Yahoo.';
      return safeJson({
        success: false,
        error: `Yahoo failed and Alpaca is not configured: ${message}`,
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
