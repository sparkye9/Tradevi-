/**
 * Massive (api.massive.com) — real-time US market data.
 * Massive.com is the rebranded Polygon.io (since Oct 2025): same API, new base URL.
 * Replaces Yahoo Finance for quotes, options chain, and news.
 */

import type { StockQuote, OptionContract, NewsItem } from './types';
import {
  estimateDelta, estimateTheta, calcBreakeven,
  estimateTargetForDoubling, estimateGainPct, calcSpreadPct, calcRiskLabel,
} from './optionsAnalysis';

const MASSIVE_BASE = 'https://api.massive.com';

function getKey(): string {
  const key = process.env.MASSIVE_API_KEY ?? '';
  if (!key) throw new Error('MASSIVE_API_KEY is not configured');
  return key;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function massiveFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${MASSIVE_BASE}${path}`);
  url.searchParams.set('apiKey', getKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Massive API ${res.status} for ${path}`);
  return res.json();
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export async function fetchMassiveQuote(
  symbol: string,
): Promise<StockQuote & { _dataSource: 'massive'; _fetchedAt: string }> {
  const json = await massiveFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = json?.ticker;
  if (!t) throw new Error(`No snapshot data for ${symbol} from Massive`);

  const day  = t.day      ?? {};
  const prev = t.prevDay  ?? {};
  const last = t.lastTrade ?? {};

  const price     = (last.p ?? day.c ?? 0) as number;
  const prevClose = (prev.c ?? price)       as number;
  const change    = price - prevClose;

  return {
    symbol,
    price,
    change,
    changePercent:        prevClose ? (change / prevClose) * 100 : (t.todaysChangePerc ?? 0),
    volume:               (day.v   ?? 0) as number,
    avgVolume:            0,
    marketCap:            0,
    fiftyTwoWeekHigh:     0,
    fiftyTwoWeekLow:      0,
    regularMarketOpen:    (day.o   ?? 0) as number,
    regularMarketDayHigh: (day.h   ?? 0) as number,
    regularMarketDayLow:  (day.l   ?? 0) as number,
    shortName:            symbol,
    longName:             symbol,
    _dataSource: 'massive',
    _fetchedAt:  new Date().toISOString(),
  };
}

// ── Options chain ─────────────────────────────────────────────────────────────

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split('T')[0];
}

export async function fetchMassiveOptionsChain(
  symbol: string,
  expirationDate?: string | number,
): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  underlyingPrice: number;
  dataSource: 'massive';
}> {
  const params: Record<string, string> = {
    limit: '250',
    order: 'asc',
    sort:  'strike_price',
  };
  if (expirationDate !== undefined && expirationDate !== '') {
    params.expiration_date = typeof expirationDate === 'number'
      ? tsToDate(expirationDate)
      : String(expirationDate);
  }

  const json = await massiveFetch(`/v3/snapshot/options/${encodeURIComponent(symbol)}`, params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = json?.results ?? [];
  if (!results.length) throw new Error(`No options data for ${symbol} from Massive`);

  const expirationSet = new Set<string>();
  const calls: OptionContract[] = [];
  const puts: OptionContract[]  = [];
  let underlyingPrice = 0;
  const nowSec = Date.now() / 1000;

  for (const r of results) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details:   any = r.details    ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const greeks:    any = r.greeks     ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day:       any = r.day        ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastQuote: any = r.last_quote ?? {};

    const strike  = parseFloat(details.strike_price ?? 0);
    const expDate = (details.expiration_date ?? '') as string;
    const type    = ((details.contract_type ?? 'call') as string).toLowerCase() as 'call' | 'put';

    if (expDate) expirationSet.add(expDate);

    const bid  = parseFloat(lastQuote.bid  ?? 0);
    const ask  = parseFloat(lastQuote.ask  ?? 0);
    const mid  = ask > 0 ? (bid + ask) / 2 : parseFloat(lastQuote.midpoint ?? day.close ?? 0);
    const lastPrice = parseFloat(day.close ?? String(mid));
    const expTs = new Date(expDate).getTime() / 1000;
    const dte   = Math.max(0, Math.ceil((expTs - nowSec) / 86400));
    const iv    = parseFloat(r.implied_volatility ?? 0.3);
    const volume = parseInt(day.volume ?? 0);
    const oi     = parseInt(r.open_interest ?? 0);

    const stockPrice = parseFloat(r.underlying?.price ?? 0) || underlyingPrice;
    if (stockPrice) underlyingPrice = stockPrice;

    const delta           = greeks.delta != null ? parseFloat(greeks.delta) : estimateDelta(stockPrice, strike, dte, iv, type);
    const theta           = greeks.theta != null ? parseFloat(greeks.theta) : estimateTheta(mid, iv, dte, delta);
    const breakeven       = calcBreakeven(strike, mid, type);
    const estimatedTarget = estimateTargetForDoubling(strike, mid, stockPrice, iv, dte, type);
    const spreadPercent   = calcSpreadPct(bid, ask);
    const gainPct         = estimateGainPct(strike, mid, estimatedTarget, dte, iv, type);
    const riskLabel       = calcRiskLabel(dte, delta, spreadPercent, iv);
    const moneyness       = stockPrice > 0
      ? ((type === 'call' ? stockPrice - strike : strike - stockPrice) / stockPrice) * 100
      : null;

    const contract: OptionContract = {
      symbol:               details.ticker ?? '',
      contractSymbol:       details.ticker ?? '',
      strike,
      expiration:           expDate,
      dte,
      bid,
      ask,
      mid,
      lastPrice,
      change:               null,
      percentChange:        null,
      volume,
      openInterest:         oi,
      openInterestChange:   null,
      impliedVolatility:    iv,
      delta,
      theta,
      gamma:                greeks.gamma != null ? parseFloat(greeks.gamma) : undefined,
      vega:                 greeks.vega  != null ? parseFloat(greeks.vega)  : undefined,
      type,
      inTheMoney:           Boolean(r.in_the_money),
      moneyness,
      lastTradeDate:        null,
      spreadPercent,
      breakeven,
      costPerContract:      ask * 100,
      estimatedTargetPrice: estimatedTarget,
      estimatedGainPercent: gainPct,
      is100PctPossible:     dte > 0 && iv > 0.3,
      is100PctRealistic:    Math.abs(delta) > 0.3 && dte > 7,
      riskLabel,
    };

    if (ask > 0) {
      if (type === 'call') calls.push(contract);
      else puts.push(contract);
    }
  }

  return {
    expirationDates: [...expirationSet].sort(),
    calls,
    puts,
    underlyingPrice,
    dataSource: 'massive',
  };
}

// ── News ──────────────────────────────────────────────────────────────────────

export async function fetchMassiveNews(symbol: string): Promise<NewsItem[]> {
  const json = await massiveFetch('/v2/reference/news', {
    ticker: symbol,
    limit:  '15',
    order:  'desc',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = json?.results ?? [];

  return items.slice(0, 15).map(item => ({
    title:       (item.title       ?? '') as string,
    link:        (item.article_url ?? '') as string,
    publisher:   (item.publisher?.name ?? '') as string,
    publishedAt: (item.published_utc ?? new Date().toISOString()) as string,
    summary:     item.description as string | undefined,
  }));
}
