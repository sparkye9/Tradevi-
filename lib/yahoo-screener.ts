// lib/yahoo-screener.ts — Yahoo Finance batch quote API screener
// Uses crumb-based auth (required since Yahoo Finance API changes in 2024)

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

// Crumb cache — valid for ~1 hour
let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 55 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }

  try {
    const homeResp = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': YF_HEADERS['User-Agent'], Accept: 'text/html' },
      redirect: 'follow',
    });

    const rawCookies = homeResp.headers.get('set-cookie') ?? '';
    const cookieParts: string[] = [];
    for (const segment of rawCookies.split(',')) {
      const kv = segment.trim().split(';')[0];
      if (/^(A1|A3|A1S|A1i|GUC|GUCS)=/i.test(kv)) cookieParts.push(kv);
    }
    const cookie = cookieParts.join('; ');

    // Try query2 first, then query1
    for (const host of ['query2', 'query1']) {
      try {
        const crumbResp = await fetch(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, {
          headers: { ...YF_HEADERS, Accept: 'text/plain, */*', Cookie: cookie },
        });
        if (!crumbResp.ok) continue;
        const crumb = (await crumbResp.text()).trim();
        if (!crumb || crumb.length < 3) continue;
        crumbCache = { crumb, cookie, ts: Date.now() };
        return { crumb, cookie };
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
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

export async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuoteRaw[]> {
  const symStr = encodeURIComponent(symbols.join(','));
  const hosts = ['query1', 'query2'];

  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await getYahooCrumb();
    const headers: Record<string, string> = { ...YF_HEADERS, Accept: 'application/json' };
    if (auth?.cookie) headers['Cookie'] = auth.cookie;
    const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';

    for (const host of hosts) {
      const url = `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${symStr}&fields=${YAHOO_FIELDS}${crumbParam}`;
      try {
        const resp = await fetch(url, { headers, cache: 'no-store' });
        if (resp.status === 401 || resp.status === 403) {
          crumbCache = null;
          break;
        }
        if (!resp.ok) continue;
        const json = await resp.json();
        const results = (json?.quoteResponse?.result ?? []) as YahooQuoteRaw[];
        if (results.length > 0) return results;
      } catch {
        continue;
      }
    }
  }

  throw new Error('Yahoo Finance unavailable after retries');
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
    const rvol = volume !== null && avgVolume3m !== null && avgVolume3m > 0 ? volume / avgVolume3m : null;
    const fiftyTwoWeekHigh = q.fiftyTwoWeekHigh ?? null;
    const dayHigh = q.regularMarketDayHigh ?? null;
    const newHighDay = dayHigh !== null && fiftyTwoWeekHigh !== null && fiftyTwoWeekHigh > 0
      ? dayHigh >= fiftyTwoWeekHigh * 0.995 : false;
    const fiftyDayAvg = q.fiftyDayAverage ?? null;
    const twoHundredDayAvg = q.twoHundredDayAverage ?? null;
    const sma50rel: FinvizQuote['sma50rel'] = price !== null && fiftyDayAvg !== null
      ? price > fiftyDayAvg ? 'above' : 'below' : null;
    const sma200rel: FinvizQuote['sma200rel'] = price !== null && twoHundredDayAvg !== null
      ? price > twoHundredDayAvg ? 'above' : 'below' : null;
    const prevClose = q.regularMarketPreviousClose ?? null;
    const open = q.regularMarketOpen ?? null;
    const gap = open !== null && prevClose !== null && prevClose > 0
      ? ((open - prevClose) / prevClose) * 100 : null;
    const sector = q.sector ?? null;
    const industry = q.industry ?? null;
    let groupStrength: FinvizQuote['groupStrength'] = null;
    if (sector && SECTOR_ETFS[sector]) {
      const etfPct = etfChangePct[SECTOR_ETFS[sector]];
      if (etfPct !== undefined) groupStrength = etfPct > 0.5 ? 'strong' : etfPct < -0.5 ? 'weak' : 'neutral';
    }

    data.push({
      symbol: q.symbol.toUpperCase(), price, changePercent, rvol,
      unusualVolume: rvol !== null && rvol >= 2,
      newHighDay, gap, sma20rel: null, sma50rel, sma200rel,
      avgVolume: avgVolume3m, float: null, sector, industry, groupStrength,
      lastUpdated: now,
    });
  }

  const result: FinvizResult<FinvizQuote> = { data, source: 'Yahoo Finance', lastUpdated: now };
  setCache(cacheKey, result);
  return result;
}
