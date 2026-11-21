/**
 * Put Hunter option chains from Tradier, across every expiration inside the
 * requested DTE window. Reuses lib/tradier.ts (same token, same endpoints as
 * the Options page) rather than a second pipeline. Yahoo's fallback chain has
 * no Greeks and is delayed, so it is never scored here.
 */
import { fetchChain, fetchTradierQuotes, getToken, tradierGet, type OptionRow } from '../../tradier';
import { daysToExpiry } from '../pricing';
import type { PutContract } from '../contracts';

export interface ChainFetch {
  symbol: string;
  underlyingPrice: number | null;
  underlyingQuoteTime: string | null;
  contracts: PutContract[];
  expirationsScanned: string[];
  source: string;
  fetchedAt: string;
  error?: string;
  partialErrors: string[];
}

/** Max expirations fetched per request (each is one Tradier call). */
const MAX_EXPIRATIONS = 12;

/**
 * Tradier stamps Greeks as "YYYY-MM-DD HH:MM:SS" without a zone. We read it as
 * New York time by default (TRADIER_GREEKS_TZ=UTC switches it); if the result
 * lands in the future the stamp is treated as unknown rather than fresh.
 */
export function parseGreeksStamp(raw: string | undefined, now: Date = new Date()): string | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const tz = process.env.TRADIER_GREEKS_TZ === 'UTC' ? 'UTC' : 'America/New_York';
  const naiveUtc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  let ms = naiveUtc;
  if (tz !== 'UTC') {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(naiveUtc));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asTz = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    ms = naiveUtc + (naiveUtc - asTz);
  }
  if (!Number.isFinite(ms) || ms > now.getTime() + 10 * 60_000) return null;
  return new Date(ms).toISOString();
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function toContract(o: OptionRow & { last?: number | null; underlying?: string }, underlying: string, now: Date): PutContract {
  return {
    symbol: o.symbol,
    underlying,
    type: o.option_type === 'call' ? 'call' : 'put',
    strike: o.strike,
    expiration: o.expiration_date,
    dte: daysToExpiry(o.expiration_date, now),
    bid: num(o.bid),
    ask: num(o.ask),
    last: num(o.last),
    volume: num(o.volume),
    openInterest: num(o.open_interest),
    delta: num(o.greeks?.delta),
    gamma: num(o.greeks?.gamma),
    theta: num(o.greeks?.theta),
    vega: num(o.greeks?.vega),
    iv: num(o.greeks?.mid_iv),
    greeksUpdatedAt: parseGreeksStamp(o.greeks?.updated_at, now),
    source: 'Tradier',
  };
}

export async function fetchPutChains(symbol: string, minDte: number, maxDte: number, now: Date = new Date()): Promise<ChainFetch> {
  const fetchedAt = now.toISOString();
  const base: ChainFetch = { symbol, underlyingPrice: null, underlyingQuoteTime: null, contracts: [], expirationsScanned: [], source: 'Tradier', fetchedAt, partialErrors: [] };
  const token = getToken();
  if (!token) return { ...base, error: 'Tradier not connected: set TRADIER_TOKEN on the server to scan live option chains.' };

  let expirations: string[];
  try {
    const exp = await tradierGet<{ expirations: { date: string[] | string } | null }>(`/markets/options/expirations?symbol=${encodeURIComponent(symbol)}`, token);
    const raw = exp.expirations?.date ?? [];
    expirations = Array.isArray(raw) ? raw : [raw];
  } catch (e) {
    return { ...base, error: `Tradier expirations failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!expirations.length) return { ...base, error: `No listed options for ${symbol}.` };
  const inWindow = expirations.filter((d) => {
    const dte = daysToExpiry(d, now);
    return dte >= minDte && dte <= maxDte;
  });
  // Thin a long window evenly so one request stays within MAX_EXPIRATIONS calls.
  const pick = inWindow.length <= MAX_EXPIRATIONS ? inWindow : inWindow.filter((_, i) => i % Math.ceil(inWindow.length / MAX_EXPIRATIONS) === 0);

  const [quotes, ...chains] = await Promise.all([
    fetchTradierQuotes([symbol]),
    ...pick.map((d) => fetchChain(symbol, d, token).then((rows) => ({ d, rows }), (e) => ({ d, error: String(e) }))),
  ]);
  const q = quotes.quotes[0];
  const contracts: PutContract[] = [];
  const partialErrors: string[] = [];
  for (const c of chains as ({ d: string; rows: OptionRow[] } | { d: string; error: string })[]) {
    if ('error' in c) {
      partialErrors.push(`${c.d}: ${c.error}`);
      continue;
    }
    for (const row of c.rows) contracts.push(toContract(row, symbol, now));
  }
  if (quotes.sourceError) partialErrors.push(`Quote: ${quotes.sourceError}`);
  return {
    ...base,
    underlyingPrice: q?.price ?? null,
    underlyingQuoteTime: q?.quoteTime ?? null,
    contracts,
    expirationsScanned: pick,
    partialErrors,
    error: pick.length === 0 ? `No ${symbol} expirations between ${minDte} and ${maxDte} days.` : undefined,
  };
}
