/**
 * Server-side Yahoo Finance direct API client.
 * No API key required. Data is ~15-20 minutes delayed for US markets.
 */

import type { StockQuote, OptionContract, NewsItem } from './types';
import {
  estimateDelta, estimateTheta, calcBreakeven,
  estimateTargetForDoubling, estimateGainPct, calcSpreadPct, calcRiskLabel,
} from './optionsAnalysis';

const YF_BASE = 'https://query1.finance.yahoo.com';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TradingApp/1.0)',
  'Accept': 'application/json',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function yfFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${url}`);
  return res.json();
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export async function fetchYahooQuote(
  symbol: string,
): Promise<StockQuote & { _dataSource: 'yahoo_delayed'; _fetchedAt: string }> {
  const url  = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const json = await yfFetch(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: any = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No quote data for ${symbol} from Yahoo Finance`);

  const price     = (meta.regularMarketPrice ?? 0) as number;
  const prevClose = (meta.chartPreviousClose ?? meta.previousClose ?? price) as number;
  const change    = price - prevClose;

  return {
    symbol,
    price,
    change,
    changePercent:        prevClose ? (change / prevClose) * 100 : 0,
    volume:               (meta.regularMarketVolume  ?? 0) as number,
    avgVolume:            0,
    marketCap:            0,
    fiftyTwoWeekHigh:     (meta.fiftyTwoWeekHigh     ?? 0) as number,
    fiftyTwoWeekLow:      (meta.fiftyTwoWeekLow      ?? 0) as number,
    regularMarketOpen:    (meta.regularMarketOpen     ?? 0) as number,
    regularMarketDayHigh: (meta.regularMarketDayHigh  ?? 0) as number,
    regularMarketDayLow:  (meta.regularMarketDayLow   ?? 0) as number,
    shortName:            (meta.shortName  ?? symbol) as string,
    longName:             (meta.longName   ?? symbol) as string,
    _dataSource: 'yahoo_delayed',
    _fetchedAt:  new Date().toISOString(),
  };
}

// ── Options chain ─────────────────────────────────────────────────────────────

function tsToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split('T')[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseContracts(raw: any[], type: 'call' | 'put', stockPrice: number, nowSec: number): OptionContract[] {
  if (!Array.isArray(raw)) return [];

  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any): OptionContract => {
      const strike  = (c.strike        ?? 0)     as number;
      const bid     = (c.bid           ?? 0)     as number;
      const ask     = (c.ask           ?? c.lastPrice ?? 0) as number;
      const expTs   = (c.expiration    ?? 0)     as number;
      const dte     = Math.max(0, Math.ceil((expTs - nowSec) / 86400));
      const iv      = (c.impliedVolatility ?? 0.3) as number;
      const volume  = (c.volume        ?? 0)     as number;
      const oi      = (c.openInterest  ?? 0)     as number;
      const itm     = (c.inTheMoney    ?? false)  as boolean;
      const mid     = ask > 0 ? (bid + ask) / 2 : ((c.lastPrice ?? 0) as number);

      const delta           = estimateDelta(stockPrice, strike, dte, iv, type);
      const theta           = estimateTheta(mid, iv, dte, delta);
      const breakeven       = calcBreakeven(strike, mid, type);
      const estimatedTarget = estimateTargetForDoubling(strike, mid, stockPrice, iv, dte, type);
      const spreadPercent   = calcSpreadPct(bid, ask);
      const costPerContract = ask * 100;
      const gainPct         = estimateGainPct(strike, mid, estimatedTarget, dte, iv, type);
      const riskLabel       = calcRiskLabel(dte, delta, spreadPercent, iv);

      return {
        contractSymbol:       (c.contractSymbol ?? '') as string,
        strike,
        expiration:           tsToDate(expTs),
        dte,
        bid,
        ask,
        lastPrice:            (c.lastPrice ?? mid)      as number,
        volume,
        openInterest:         oi,
        impliedVolatility:    iv,
        delta,
        theta,
        gamma:                c.gamma as number | undefined,
        vega:                 c.vega  as number | undefined,
        type,
        inTheMoney:           itm,
        spreadPercent,
        breakeven,
        costPerContract,
        estimatedTargetPrice: estimatedTarget,
        estimatedGainPercent: gainPct,
        is100PctPossible:     dte > 0 && iv > 0.3,
        is100PctRealistic:    Math.abs(delta) > 0.3 && dte > 7,
        riskLabel,
      };
    })
    .filter(c => c.ask > 0);
}

export async function fetchYahooOptionsChain(
  symbol: string,
  expirationDate?: string,
): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  dataSource: 'yahoo_delayed';
}> {
  let url = `${YF_BASE}/v7/finance/options/${encodeURIComponent(symbol)}`;
  if (expirationDate) {
    const epoch = Math.floor(new Date(expirationDate).getTime() / 1000);
    url += `?date=${epoch}`;
  }

  const json   = await yfFetch(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol} from Yahoo Finance`);

  const stockPrice      = (result.quote?.regularMarketPrice ?? 0) as number;
  const rawDates        = (result.expirationDates ?? [])          as number[];
  const expirationDates = rawDates.map(tsToDate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = result.options?.[0];
  if (!options) return { expirationDates, calls: [], puts: [], dataSource: 'yahoo_delayed' };

  const nowSec = Date.now() / 1000;
  const calls  = parseContracts(options.calls ?? [], 'call', stockPrice, nowSec);
  const puts   = parseContracts(options.puts  ?? [], 'put',  stockPrice, nowSec);

  return { expirationDates, calls, puts, dataSource: 'yahoo_delayed' };
}

// ── News ──────────────────────────────────────────────────────────────────────

export async function fetchYahooNews(symbol: string): Promise<NewsItem[]> {
  const url  = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=15&quotesCount=0&enableFuzzyQuery=false`;
  const json = await yfFetch(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = json?.news ?? [];

  return items.slice(0, 15).map(item => ({
    title:       (item.title     ?? '')  as string,
    link:        (item.link      ?? '')  as string,
    publisher:   (item.publisher ?? '')  as string,
    publishedAt: item.providerPublishTime
      ? new Date((item.providerPublishTime as number) * 1000).toISOString()
      : new Date().toISOString(),
    summary: item.summary as string | undefined,
  }));
}
