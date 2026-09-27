// Full option chain for one ticker + expiration, laid out strike by strike
// (calls on one side, puts on the other) for the student-facing Options page.
// Tradier first (has greeks); Yahoo Finance as a fallback (no greeks).

import { fetchChain, fetchTradierQuotes, getToken, tradierGet } from './tradier';
import { getYahooSession, type YahooOptionContract } from './yahoo-fallback';

export interface ChainLeg {
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
  delta: number | null;
  theta: number | null;
}

export interface ChainRow {
  strike: number;
  call: ChainLeg | null;
  put: ChainLeg | null;
}

export interface ChainResult {
  symbol: string;
  underlying: number | null;
  expirations: string[]; // YYYY-MM-DD
  expiration: string | null;
  rows: ChainRow[];
  hasGreeks: boolean;
  source: string;
  lastUpdated: string;
  sourceError?: string;
}

/** How many strikes to keep either side of the stock price. */
const STRIKES_EACH_SIDE = 10;

function nearMoney(rows: ChainRow[], underlying: number | null): ChainRow[] {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  if (underlying == null || sorted.length <= STRIKES_EACH_SIDE * 2) return sorted;
  let idx = sorted.findIndex((r) => r.strike >= underlying);
  if (idx === -1) idx = sorted.length - 1;
  const start = Math.max(0, idx - STRIKES_EACH_SIDE);
  return sorted.slice(start, start + STRIKES_EACH_SIDE * 2);
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function empty(symbol: string, source: string, sourceError: string): ChainResult {
  return {
    symbol,
    underlying: null,
    expirations: [],
    expiration: null,
    rows: [],
    hasGreeks: false,
    source,
    lastUpdated: new Date().toISOString(),
    sourceError,
  };
}

async function tradierChain(symbol: string, expiration: string | null): Promise<ChainResult> {
  const token = getToken();
  if (!token) return empty(symbol, 'Tradier', 'Tradier not connected');

  try {
    const expData = await tradierGet<{ expirations: { date: string[] | string } | null }>(
      `/markets/options/expirations?symbol=${encodeURIComponent(symbol)}`,
      token,
    );
    const raw = expData.expirations?.date ?? [];
    const expirations = Array.isArray(raw) ? raw : [raw];
    if (!expirations.length) return empty(symbol, 'Tradier', `No options found for ${symbol}`);
    const exp = expiration && expirations.includes(expiration) ? expiration : expirations[0];

    const [chain, quotes] = await Promise.all([fetchChain(symbol, exp, token), fetchTradierQuotes([symbol])]);
    const underlying = quotes.quotes[0]?.price ?? null;

    const byStrike = new Map<number, ChainRow>();
    for (const o of chain) {
      const row = byStrike.get(o.strike) ?? { strike: o.strike, call: null, put: null };
      const leg: ChainLeg = {
        bid: num(o.bid),
        ask: num(o.ask),
        last: null,
        volume: num(o.volume),
        openInterest: num(o.open_interest),
        iv: num(o.greeks?.mid_iv),
        delta: num(o.greeks?.delta),
        theta: num(o.greeks?.theta),
      };
      if (o.option_type === 'call') row.call = leg;
      else row.put = leg;
      byStrike.set(o.strike, row);
    }

    return {
      symbol,
      underlying,
      expirations,
      expiration: exp,
      rows: nearMoney(Array.from(byStrike.values()), underlying),
      hasGreeks: true,
      source: 'Tradier',
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    return empty(symbol, 'Tradier', String(err));
  }
}

interface YahooChainResponse {
  optionChain?: {
    result?: Array<{
      expirationDates?: number[];
      quote?: { regularMarketPrice?: number };
      options?: Array<{ expirationDate?: number; calls?: YahooOptionContract[]; puts?: YahooOptionContract[] }>;
    }>;
  };
}

const UA = 'Mozilla/5.0 (compatible; Tradevi/3.0)';

function ymd(ts: number): string {
  return new Date(ts * 1000).toISOString().split('T')[0];
}

async function yahooChain(symbol: string, expiration: string | null): Promise<ChainResult> {
  const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;

  async function request(dateTs: number | null, forceRefresh = false) {
    const sess = await getYahooSession(forceRefresh);
    const params = new URLSearchParams();
    if (sess) params.set('crumb', sess.crumb);
    if (dateTs) params.set('date', String(dateTs));
    const qs = params.toString();
    const headers: Record<string, string> = { 'User-Agent': UA };
    if (sess) headers.Cookie = sess.cookie;
    let resp = await fetch(qs ? `${base}?${qs}` : base, { headers, cache: 'no-store' });
    if ((resp.status === 401 || resp.status === 403) && !forceRefresh) {
      resp = await request(dateTs, true);
    }
    return resp;
  }

  try {
    let resp = await request(null);
    if (!resp.ok) return empty(symbol, 'Yahoo Finance', `Yahoo Finance HTTP ${resp.status}`);
    let json = (await resp.json()) as YahooChainResponse;
    let result = json.optionChain?.result?.[0];
    if (!result) return empty(symbol, 'Yahoo Finance', `No options found for ${symbol}`);

    const dates = result.expirationDates ?? [];
    const expirations = dates.map(ymd);
    const wanted = expiration ? dates.find((d) => ymd(d) === expiration) : undefined;
    if (wanted && wanted !== result.options?.[0]?.expirationDate) {
      resp = await request(wanted);
      if (resp.ok) {
        json = (await resp.json()) as YahooChainResponse;
        result = json.optionChain?.result?.[0] ?? result;
      }
    }

    const set = result.options?.[0];
    const byStrike = new Map<number, ChainRow>();
    const leg = (o: YahooOptionContract): ChainLeg => ({
      bid: num(o.bid),
      ask: num(o.ask),
      last: num(o.lastPrice),
      volume: num(o.volume),
      openInterest: num(o.openInterest),
      iv: num(o.impliedVolatility),
      delta: null,
      theta: null,
    });
    for (const c of set?.calls ?? []) {
      if (c.strike == null) continue;
      const row = byStrike.get(c.strike) ?? { strike: c.strike, call: null, put: null };
      row.call = leg(c);
      byStrike.set(c.strike, row);
    }
    for (const p of set?.puts ?? []) {
      if (p.strike == null) continue;
      const row = byStrike.get(p.strike) ?? { strike: p.strike, call: null, put: null };
      row.put = leg(p);
      byStrike.set(p.strike, row);
    }
    const underlying = num(result.quote?.regularMarketPrice);

    return {
      symbol,
      underlying,
      expirations,
      expiration: set?.expirationDate ? ymd(set.expirationDate) : expirations[0] ?? null,
      rows: nearMoney(Array.from(byStrike.values()), underlying),
      hasGreeks: false,
      source: 'Yahoo Finance',
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    return empty(symbol, 'Yahoo Finance', `Yahoo Finance fetch failed: ${String(err)}`);
  }
}

export async function fetchOptionChain(symbol: string, expiration: string | null): Promise<ChainResult> {
  const tradier = await tradierChain(symbol, expiration);
  if (!tradier.sourceError) return tradier;
  const yahoo = await yahooChain(symbol, expiration);
  if (!yahoo.sourceError) return yahoo;
  // Prefer the more specific "no options" message when either source said so.
  if (tradier.sourceError.startsWith('No options')) return tradier;
  return yahoo;
}
