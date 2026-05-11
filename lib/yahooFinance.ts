/**
 * Server-side Yahoo Finance direct API client.
 * No API key required. Data is ~15-20 minutes delayed for US markets.
 */

import type { StockQuote, OptionContract, NewsItem } from './types';
import {
  estimateDelta, estimateTheta, calcBreakeven,
  estimateTargetForDoubling, estimateGainPct, calcSpreadPct, calcRiskLabel,
} from './optionsAnalysis';

const YF_BASE         = 'https://query1.finance.yahoo.com';
const YF_OPTIONS_BASE = 'https://query2.finance.yahoo.com';

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const YF_HEADERS = {
  'User-Agent':      YF_UA,
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://finance.yahoo.com/',
};

// ── Crumb / session cache ──────────────────────────────────────────────────────
// Yahoo Finance v7 options endpoint requires a crumb token obtained from a
// prior authenticated session. We cache it per serverless instance (warm reuse).

let _session: { crumb: string; cookie: string; expiresAt: number } | null = null;

async function getYahooSession(): Promise<{ crumb: string; cookie: string } | null> {
  const now = Date.now();
  if (_session && now < _session.expiresAt) return _session;

  try {
    // Attempt 1 — try crumb endpoint without any cookie (works in many regions)
    const directRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, 'Accept': '*/*' },
      cache: 'no-store',
    });
    if (directRes.ok) {
      const crumb = (await directRes.text()).trim();
      if (crumb && !crumb.trimStart().startsWith('<')) {
        _session = { crumb, cookie: '', expiresAt: now + 3_600_000 };
        return _session;
      }
    }

    // Attempt 2 — get cookies from Yahoo Finance homepage, then exchange for crumb
    const homeRes = await fetch('https://finance.yahoo.com', {
      headers: { 'User-Agent': YF_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      cache: 'no-store',
    });

    // Node 18+ exposes getSetCookie(); fall back to single header otherwise
    const rawCookies: string[] =
      typeof (homeRes.headers as any).getSetCookie === 'function'
        ? (homeRes.headers as any).getSetCookie()
        : [(homeRes.headers.get('set-cookie') ?? '')].filter(Boolean);

    const cookie = rawCookies
      .map((s: string) => s.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    if (!cookie) return null;

    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, 'Cookie': cookie },
      cache: 'no-store',
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.trimStart().startsWith('<')) return null;

    _session = { crumb, cookie, expiresAt: now + 3_600_000 };
    return _session;
  } catch {
    return null;
  }
}

// ── Low-level fetch helpers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function yfFetch(url: string, cookie?: string): Promise<any> {
  const headers: Record<string, string> = { ...YF_HEADERS };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error('Yahoo Finance returned an HTML page — likely rate-limited or blocked');
  }
  return JSON.parse(text);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function yfOptionsFetch(url: string, session: { crumb: string; cookie: string } | null): Promise<any> {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = session?.crumb ? `${url}${sep}crumb=${encodeURIComponent(session.crumb)}` : url;
  return yfFetch(fullUrl, session?.cookie || undefined);
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
  expirationDate?: string | number,  // YYYY-MM-DD string OR Unix timestamp number
): Promise<{
  expirationDates: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  underlyingPrice: number;
  dataSource: 'yahoo_delayed';
}> {
  const session = await getYahooSession();

  let url = `${YF_OPTIONS_BASE}/v7/finance/options/${encodeURIComponent(symbol)}`;
  if (expirationDate !== undefined && expirationDate !== '') {
    const epoch = typeof expirationDate === 'number'
      ? expirationDate
      : Math.floor(new Date(expirationDate).getTime() / 1000);
    url += `?date=${epoch}`;
  }

  const json   = await yfOptionsFetch(url, session);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol} from Yahoo Finance`);

  const stockPrice      = (result.quote?.regularMarketPrice ?? 0) as number;
  const rawDates        = (result.expirationDates ?? [])          as number[];
  const expirationDates = rawDates.map(tsToDate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = result.options?.[0];
  if (!options) return { expirationDates, calls: [], puts: [], underlyingPrice: stockPrice, dataSource: 'yahoo_delayed' };

  const nowSec = Date.now() / 1000;
  const calls  = parseContracts(options.calls ?? [], 'call', stockPrice, nowSec);
  const puts   = parseContracts(options.puts  ?? [], 'put',  stockPrice, nowSec);

  return { expirationDates, calls, puts, underlyingPrice: stockPrice, dataSource: 'yahoo_delayed' };
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
