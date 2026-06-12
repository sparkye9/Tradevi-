// lib/options-fetcher.ts — Yahoo Finance options chain fetcher with 60s cache

import { bsmDelta, bsmGamma, spreadPct, daysToExpiry } from '@/lib/options-utils';

export interface PutContract {
  contractSymbol: string;
  strike: number;
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: number;
  daysToExpiry: number;
  spreadPct: number;
  lastPrice: number;
  inTheMoney: boolean;
}

export interface OptionsData {
  symbol: string;
  price: number;
  expirationDates: number[];
  puts: PutContract[];
  error: string | null;
}

const optionsCache = new Map<string, { data: OptionsData; ts: number }>();
const OPTIONS_TTL = 60_000;

const RISK_FREE_RATE = 0.05;

export async function fetchOptionsChain(
  symbol: string,
  expiryTs?: number
): Promise<OptionsData> {
  const cacheKey = `${symbol}:${expiryTs ?? 'nearest'}`;
  const cached = optionsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < OPTIONS_TTL) return cached.data;

  const url = expiryTs
    ? `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?date=${expiryTs}`
    : `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;

  let json: Record<string, unknown>;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const errData: OptionsData = {
        symbol,
        price: 0,
        expirationDates: [],
        puts: [],
        error: `HTTP ${resp.status}`,
      };
      return errData;
    }
    json = await resp.json() as Record<string, unknown>;
  } catch (err) {
    const errData: OptionsData = {
      symbol,
      price: 0,
      expirationDates: [],
      puts: [],
      error: String(err),
    };
    return errData;
  }

  try {
    const optionChain = json?.optionChain as Record<string, unknown> | undefined;
    const results = optionChain?.result as Record<string, unknown>[] | undefined;
    const result = results?.[0];
    if (!result) {
      const errData: OptionsData = {
        symbol,
        price: 0,
        expirationDates: [],
        puts: [],
        error: 'No results from Yahoo Finance',
      };
      return errData;
    }

    const expirationDates = (result.expirationDates as number[]) ?? [];
    const quote = result.quote as Record<string, unknown> | undefined;
    const currentPrice = (quote?.regularMarketPrice as number) ?? 0;
    const underlyingSymbol = (result.underlyingSymbol as string) ?? symbol;

    const options = result.options as Record<string, unknown>[] | undefined;
    const rawPuts = (options?.[0]?.puts as Record<string, unknown>[]) ?? [];

    const puts: PutContract[] = rawPuts.map((p) => {
      const strike = (p.strike as number) ?? 0;
      const bid = (p.bid as number) ?? 0;
      const ask = (p.ask as number) ?? 0;
      const iv = (p.impliedVolatility as number) ?? 0;
      const expiration = (p.expiration as number) ?? 0;
      const dte = daysToExpiry(expiration);
      const T = dte / 365;

      const delta = bsmDelta(currentPrice, strike, T, RISK_FREE_RATE, iv, true);
      const gamma = bsmGamma(currentPrice, strike, T, RISK_FREE_RATE, iv);
      const sp = spreadPct(bid, ask);

      return {
        contractSymbol: (p.contractSymbol as string) ?? '',
        strike,
        bid,
        ask,
        delta,
        gamma,
        volume: (p.volume as number) ?? 0,
        openInterest: (p.openInterest as number) ?? 0,
        impliedVolatility: iv,
        expiration,
        daysToExpiry: dte,
        spreadPct: sp,
        lastPrice: (p.lastPrice as number) ?? 0,
        inTheMoney: (p.inTheMoney as boolean) ?? false,
      };
    });

    const data: OptionsData = {
      symbol: underlyingSymbol,
      price: currentPrice,
      expirationDates,
      puts,
      error: null,
    };

    optionsCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (err) {
    const errData: OptionsData = {
      symbol,
      price: 0,
      expirationDates: [],
      puts: [],
      error: `Parse error: ${String(err)}`,
    };
    return errData;
  }
}
