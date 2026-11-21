/**
 * Freshness engine for US stock / ETF quotes.
 *
 * Decides whether a quote is current enough to show as a price and to feed
 * into a scan or signal. It combines three things:
 *  - the security registry (lib/securities/registry.ts): reviewed-inactive
 *    symbols (delisted, acquired, renamed) are never fresh;
 *  - the listing venue (lib/securities/exchanges.ts): only venues on the US
 *    equity calendar can be judged; anything else is "unverified";
 *  - the session calendar (lib/marketData/session.ts): what age is normal
 *    depends on whether the regular session, pre-market or after-hours is
 *    running, or the market is shut.
 *
 * Every limit is in FreshnessLimits below, documented in
 * docs/CALCULATIONS.md §9a, and overridable per call or by environment
 * variable (see FRESHNESS_ENV_VARS). Futures / FX / crypto rows are
 * classified by lib/quoteFreshness.ts, not here.
 */
import { EXCHANGES, normalizeExchange, type CanonicalExchange } from '../securities/exchanges';
import { curatedSecurity, lifecycleFor, type LifecycleRecord } from '../securities/registry';
import { equitySession, etWallClock, tradingDaysBetween, type EquitySessionInfo } from './session';

export interface FreshnessLimits {
  /** Regular session: max last-trade age (seconds) before the quote is stale. */
  regularMaxAgeSec: number;
  /** Pre-market / after-hours: max age of an extended-hours trade. Trading is thin, so this is looser. */
  extendedMaxAgeSec: number;
  /** Regular session: within this age (and no provider delay) the quote is "live". */
  liveMaxAgeSec: number;
  /** After the 9:30 open, a quote from the prior session is "awaiting first trade", not stale, for this long. */
  openGraceSec: number;
  /** Market shut: how many completed sessions the last trade may lag behind the most recent one. 0 = must be from it. */
  closedMaxSessionsBehind: number;
  /** A timestamp this far in the future is treated as clock skew and clamped; further than this it is rejected. */
  maxFutureSkewSec: number;
  /** Largest provider-declared delay that is still acceptable. A bigger delay makes the quote stale. */
  maxDeclaredDelaySec: number;
}

/** Defaults. Changing one is a product decision — update docs/CALCULATIONS.md §9a with it. */
export const DEFAULT_FRESHNESS_LIMITS: Readonly<FreshnessLimits> = Object.freeze({
  regularMaxAgeSec: 15 * 60,
  extendedMaxAgeSec: 60 * 60,
  liveMaxAgeSec: 60,
  openGraceSec: 5 * 60,
  closedMaxSessionsBehind: 0,
  maxFutureSkewSec: 120,
  maxDeclaredDelaySec: 20 * 60,
});

/** Environment variable for each limit (whole seconds / sessions). */
export const FRESHNESS_ENV_VARS: Readonly<Record<keyof FreshnessLimits, string>> = Object.freeze({
  regularMaxAgeSec: 'MARKET_DATA_REGULAR_MAX_AGE_SEC',
  extendedMaxAgeSec: 'MARKET_DATA_EXTENDED_MAX_AGE_SEC',
  liveMaxAgeSec: 'MARKET_DATA_LIVE_MAX_AGE_SEC',
  openGraceSec: 'MARKET_DATA_OPEN_GRACE_SEC',
  closedMaxSessionsBehind: 'MARKET_DATA_CLOSED_MAX_SESSIONS_BEHIND',
  maxFutureSkewSec: 'MARKET_DATA_MAX_FUTURE_SKEW_SEC',
  maxDeclaredDelaySec: 'MARKET_DATA_MAX_DECLARED_DELAY_SEC',
});

function validLimit(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Throws on a negative, NaN or contradictory limit so a bad config fails loudly instead of marking everything fresh. */
export function validateLimits(l: FreshnessLimits): FreshnessLimits {
  for (const k of Object.keys(DEFAULT_FRESHNESS_LIMITS) as (keyof FreshnessLimits)[]) {
    if (!validLimit(l[k])) throw new Error(`Freshness limit ${k} must be a non-negative number, got ${String(l[k])}`);
  }
  if (l.liveMaxAgeSec > l.regularMaxAgeSec) {
    throw new Error(`liveMaxAgeSec (${l.liveMaxAgeSec}) cannot exceed regularMaxAgeSec (${l.regularMaxAgeSec})`);
  }
  return l;
}

/**
 * Effective limits: defaults, then environment variables, then explicit
 * overrides. An env value that is not a non-negative number is ignored with
 * a warning (the default stays); an explicit override that is invalid throws.
 */
export function resolveFreshnessLimits(
  overrides: Partial<FreshnessLimits> = {},
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): FreshnessLimits {
  const out: FreshnessLimits = { ...DEFAULT_FRESHNESS_LIMITS };
  for (const k of Object.keys(FRESHNESS_ENV_VARS) as (keyof FreshnessLimits)[]) {
    const raw = env[FRESHNESS_ENV_VARS[k]];
    if (raw == null || raw.trim() === '') continue;
    const n = Number(raw);
    if (validLimit(n)) out[k] = n;
    else console.warn(`[freshness] ignoring ${FRESHNESS_ENV_VARS[k]}=${raw}: not a non-negative number`);
  }
  for (const k of Object.keys(overrides) as (keyof FreshnessLimits)[]) {
    const v = overrides[k];
    if (v !== undefined) out[k] = v;
  }
  return validateLimits(out);
}

export type QuoteFreshnessState =
  /** Regular session, provider says real-time, age ≤ liveMaxAgeSec. */
  | 'live'
  /** Within limits, but delayed by the provider or older than liveMaxAgeSec. */
  | 'delayed'
  /** Market shut (or extended hours with no extended trade yet) and the quote is the latest completed session's. */
  | 'closed'
  /** Outside the limits for the current session. */
  | 'stale'
  /** No usable price or timestamp. */
  | 'unavailable'
  /** Venue unknown or not on the US equity calendar, so age cannot be judged. */
  | 'unverified'
  /** A reviewed registry record says this ticker no longer trades. */
  | 'inactive';

export interface QuoteInput {
  symbol: string;
  price: number | null | undefined;
  /** Last-trade time in epoch milliseconds. */
  lastTradeMs: number | null | undefined;
  /** Provider venue code (Yahoo, Tradier or canonical). Falls back to the registry's expected venue. */
  exchange?: string | null;
  /** Provider-declared delay in seconds; null/undefined when the provider does not say. */
  declaredDelaySec?: number | null;
}

export interface QuoteFreshness {
  symbol: string;
  state: QuoteFreshnessState;
  /** True for every state except live / delayed / closed. */
  stale: boolean;
  /** Safe to show as the current price and feed into calculations. */
  usable: boolean;
  ageSec: number | null;
  /** The limit that was applied (seconds), when one was. */
  limitSec: number | null;
  session: EquitySessionInfo['session'];
  exchange: CanonicalExchange | null;
  /** Provider and registry disagree on the venue. The quote may belong to a different listing. */
  exchangeMismatch: boolean;
  lifecycle: LifecycleRecord | null;
  detail: string;
}

function fmtAge(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 90 * 60) return `${Math.round(sec / 60)} min`;
  if (sec < 48 * 3600) return `${(sec / 3600).toFixed(1)} h`;
  return `${Math.round(sec / 86400)} days`;
}

/**
 * Classify one quote. Pure: pass `now` and `limits` to make it deterministic.
 */
export function assessQuote(q: QuoteInput, now: Date = new Date(), limits: FreshnessLimits = resolveFreshnessLimits()): QuoteFreshness {
  const symbol = q.symbol.trim().toUpperCase();
  const sess = equitySession(now);
  const curated = curatedSecurity(symbol);
  const providerEx = normalizeExchange(q.exchange ?? null);
  const exchange = providerEx ?? curated?.expectedExchange ?? null;
  const exchangeMismatch = Boolean(providerEx && curated?.expectedExchange && providerEx !== curated.expectedExchange);
  const lifecycle = lifecycleFor(symbol);

  const base = { symbol, session: sess.session, exchange, exchangeMismatch, lifecycle };
  const result = (state: QuoteFreshnessState, ageSec: number | null, limitSec: number | null, detail: string): QuoteFreshness => {
    const usable = (state === 'live' || state === 'delayed' || state === 'closed') && !exchangeMismatch;
    return { ...base, state, stale: !(state === 'live' || state === 'delayed' || state === 'closed'), usable, ageSec, limitSec, detail };
  };

  if (lifecycle) {
    const to = lifecycle.successor ? ` Successor: ${lifecycle.successor.symbol}.` : '';
    return result('inactive', null, null, `${symbol} ${lifecycle.status} on ${lifecycle.effective} — no longer trades under this ticker.${to}`);
  }
  if (!exchange) return result('unverified', null, null, 'Listing venue unknown — cannot judge quote age.');
  if (!EXCHANGES[exchange].usEquityCalendar) {
    return result('unverified', null, null, `${EXCHANGES[exchange].label} is not on the US equity calendar — cannot judge quote age.`);
  }

  const price = q.price;
  const ts = q.lastTradeMs;
  if (price == null || !Number.isFinite(price) || price <= 0) return result('unavailable', null, null, 'No valid price returned.');
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return result('unavailable', null, null, 'No last-trade timestamp returned.');

  const rawAge = (now.getTime() - ts) / 1000;
  if (rawAge < -limits.maxFutureSkewSec) {
    return result('unavailable', null, null, `Last-trade time is ${fmtAge(-rawAge)} in the future — bad timestamp.`);
  }
  const ageSec = Math.max(0, rawAge);
  const delay = q.declaredDelaySec;
  if (delay != null && Number.isFinite(delay) && delay > limits.maxDeclaredDelaySec) {
    return result('stale', ageSec, limits.maxDeclaredDelaySec, `Provider delay ${fmtAge(delay)} exceeds the ${fmtAge(limits.maxDeclaredDelaySec)} limit.`);
  }

  const tradeDay = etWallClock(new Date(ts)).ymd;
  // Trading sessions between the quote's day and the most recent completed one.
  const sessionsBehind = tradingDaysBetween(tradeDay, sess.lastCompletedSession);
  const fromLatestCompleted = tradeDay >= sess.lastCompletedSession;
  const sessionsDetail = `${sessionsBehind} session${sessionsBehind === 1 ? '' : 's'} behind`;

  if (sess.session === 'REGULAR') {
    if (ageSec <= limits.regularMaxAgeSec) {
      const realtime = delay === 0;
      if (realtime && ageSec <= limits.liveMaxAgeSec) return result('live', ageSec, limits.regularMaxAgeSec, 'Real-time quote.');
      return result(
        'delayed',
        ageSec,
        limits.regularMaxAgeSec,
        delay == null ? `Provider delay not stated — last trade ${fmtAge(ageSec)} ago.` : `Last trade ${fmtAge(ageSec)} ago.`,
      );
    }
    const intoRegularSec = (sess.minutesIntoRegular ?? 0) * 60;
    if (intoRegularSec <= limits.openGraceSec && tradeDay < sess.todayEt && fromLatestCompleted) {
      return result('closed', ageSec, limits.openGraceSec, 'Market just opened — no trade yet today; showing the prior close.');
    }
    return result('stale', ageSec, limits.regularMaxAgeSec, `STALE — market open but last trade ${fmtAge(ageSec)} ago (limit ${fmtAge(limits.regularMaxAgeSec)}).`);
  }

  if (sess.session === 'PRE' || sess.session === 'POST') {
    if (ageSec <= limits.extendedMaxAgeSec) {
      return result('delayed', ageSec, limits.extendedMaxAgeSec, `${sess.session === 'PRE' ? 'Pre-market' : 'After-hours'} trade ${fmtAge(ageSec)} ago.`);
    }
    if (fromLatestCompleted) {
      return result('closed', ageSec, null, `${sess.label}. No recent extended-hours trade; showing the ${sess.lastCompletedSession} session.`);
    }
    return result('stale', ageSec, null, `STALE — last trade is from ${tradeDay}, ${sessionsDetail} ${sess.lastCompletedSession}.`);
  }

  // CLOSED (overnight, weekend, holiday).
  if (sessionsBehind <= limits.closedMaxSessionsBehind) {
    return result('closed', ageSec, null, `${sess.label}. Last trade ${tradeDay}.`);
  }
  return result('stale', ageSec, null, `STALE — market closed and last trade is from ${tradeDay}, ${sessionsDetail} ${sess.lastCompletedSession}.`);
}

/** Classify many quotes against one clock and one set of limits. */
export function assessQuotes(quotes: readonly QuoteInput[], now: Date = new Date(), limits: FreshnessLimits = resolveFreshnessLimits()): QuoteFreshness[] {
  return quotes.map((q) => assessQuote(q, now, limits));
}
