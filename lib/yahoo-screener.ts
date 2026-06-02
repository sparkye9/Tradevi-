// lib/yahoo-screener.ts — Yahoo Finance batch quote API screener
// Replaces Finviz screener (Finviz blocks cloud/Vercel IPs)

import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

const SECTOR_ETFS: Record<string, string> = {
  Technology: 'XLK',
  'Financial Services': 'XLF',
  Healthcare: 'XLV',
  'Consumer Cyclical': 'XLY',
  'Communication Services': 'XLC',
  Energy: 'XLE',
  Industrials: 'XLI',
  'Consumer Defensive': 'XLP',
  Utilities: 'XLU',
  'Basic Materials': 'XLB',
  'Real Estate': 'XLRE',
};

const ALL_SECTOR_ETFS = Object.values(SECTOR_ETFS).filter((v, i, a) => a.indexOf(v) === i);

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

interface YahooQuoteRaw {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  fiftyTwoWeekHigh?: number;
  sector?: string;
  industry?: string;
  shortName?: string;
}

const YAHOO_FIELDS = [
  'regularMarketPrice',
  'regularMarketChangePercent',
  'regularMarketVolume',
  'averageDailyVolume3Month',
  'averageDailyVolume10Day',
  'fiftyDayAverage',
  'twoHundredDayAverage',
  'regularMarketDayHigh',
  'regularMarketDayLow',
  'regularMarketPreviousClose',
  'regularMarketOpen',
  'fiftyTwoWeekHigh',
  'sector',
  'industry',
  'shortName',
].join(',');

async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuoteRaw[]> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&fields=${YAHOO_FIELDS}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!resp.ok) {
    throw new Error(`Yahoo Finance returned HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json?.quoteResponse?.result ?? []) as YahooQuoteRaw[];
}

export async function fetchYahooScreener(
  tickers: string[]
): Promise<FinvizResult<FinvizQuote>> {
  if (tickers.length === 0) {
    return { data: [], source: 'Yahoo Finance', lastUpdated: new Date().toISOString() };
  }

  const cacheKey = `yahoo-screener:${[...tickers].sort().join(',')}`;
  const cached = getCached<FinvizResult<FinvizQuote>>(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();

  // Fetch tickers + all sector ETFs in one batch call
  const combined = [...tickers, ...ALL_SECTOR_ETFS];
  const allSymbols = combined.filter((v, i, a) => a.indexOf(v) === i);

  let quotes: YahooQuoteRaw[];
  try {
    quotes = await fetchYahooQuotes(allSymbols);
  } catch (err) {
    return {
      data: [],
      source: 'Yahoo Finance',
      sourceError: `Yahoo Finance fetch failed: ${String(err)}`,
      lastUpdated: now,
    };
  }

  // Build sector ETF changePercent map
  const etfChangePct: Record<string, number> = {};
  for (const q of quotes) {
    if (ALL_SECTOR_ETFS.includes(q.symbol) && q.regularMarketChangePercent !== undefined) {
      etfChangePct[q.symbol] = q.regularMarketChangePercent;
    }
  }

  const upperTickers = tickers.map((t) => t.toUpperCase());
  const data: FinvizQuote[] = [];

  for (const q of quotes) {
    if (!upperTickers.includes(q.symbol.toUpperCase())) continue;

    const price = q.regularMarketPrice ?? null;
    const changePercent = q.regularMarketChangePercent ?? null;
    const volume = q.regularMarketVolume ?? null;
    const avgVolume3m = q.averageDailyVolume3Month ?? null;

    const rvol =
      volume !== null && avgVolume3m !== null && avgVolume3m > 0
        ? volume / avgVolume3m
        : null;

    const unusualVolume = rvol !== null && rvol >= 2;

    const fiftyTwoWeekHigh = q.fiftyTwoWeekHigh ?? null;
    const dayHigh = q.regularMarketDayHigh ?? null;
    const newHighDay =
      dayHigh !== null && fiftyTwoWeekHigh !== null && fiftyTwoWeekHigh > 0
        ? dayHigh >= fiftyTwoWeekHigh * 0.995
        : false;

    const fiftyDayAvg = q.fiftyDayAverage ?? null;
    const twoHundredDayAvg = q.twoHundredDayAverage ?? null;

    const sma50rel: FinvizQuote['sma50rel'] =
      price !== null && fiftyDayAvg !== null
        ? price > fiftyDayAvg
          ? 'above'
          : 'below'
        : null;

    const sma200rel: FinvizQuote['sma200rel'] =
      price !== null && twoHundredDayAvg !== null
        ? price > twoHundredDayAvg
          ? 'above'
          : 'below'
        : null;

    // Yahoo batch quote doesn't provide SMA20
    const sma20rel: FinvizQuote['sma20rel'] = null;

    const prevClose = q.regularMarketPreviousClose ?? null;
    const open = q.regularMarketOpen ?? null;
    const gap =
      open !== null && prevClose !== null && prevClose > 0
        ? ((open - prevClose) / prevClose) * 100
        : null;

    const sector = q.sector ?? null;
    const industry = q.industry ?? null;

    let groupStrength: FinvizQuote['groupStrength'] = null;
    if (sector && SECTOR_ETFS[sector]) {
      const etfSym = SECTOR_ETFS[sector];
      const etfPct = etfChangePct[etfSym];
      if (etfPct !== undefined) {
        groupStrength = etfPct > 0.5 ? 'strong' : etfPct < -0.5 ? 'weak' : 'neutral';
      }
    }

    data.push({
      symbol: q.symbol.toUpperCase(),
      rvol,
      unusualVolume,
      newHighDay,
      changePercent,
      gap,
      sma20rel,
      sma50rel,
      sma200rel,
      avgVolume: avgVolume3m,
      float: null, // Yahoo batch quote doesn't provide float
      sector,
      industry,
      groupStrength,
      price,
      lastUpdated: now,
    });
  }

  const result: FinvizResult<FinvizQuote> = {
    data,
    source: 'Yahoo Finance',
    lastUpdated: now,
  };
  setCache(cacheKey, result);
  return result;
}
