/**
 * Deterministic checks for the market data layer: equity session calendar,
 * security registry, exchange resolution and the quote freshness engine.
 * Run: npx tsx scripts/check-market-data.ts
 */
import {
  DEFAULT_FRESHNESS_LIMITS,
  assessQuote,
  resolveFreshnessLimits,
  type FreshnessLimits,
  type QuoteInput,
} from '../lib/marketData/freshness';
import { equitySession, previousTradingDay, tradingDaysBetween } from '../lib/marketData/session';
import { CURATED_TICKERS, CURATED_UNIVERSE, isInactive, partitionUniverse } from '../lib/securities/registry';
import { exchangeFromTradier, exchangeFromYahoo, tradingViewSymbol } from '../lib/securities/exchanges';

let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`, extra ?? '');
  }
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const Z = (iso: string) => new Date(iso);
const L: FreshnessLimits = { ...DEFAULT_FRESHNESS_LIMITS };
const q = (over: Partial<QuoteInput> & { at: string }): QuoteInput => ({
  symbol: 'AAPL',
  price: 200,
  lastTradeMs: Z(over.at).getTime(),
  exchange: 'NMS',
  declaredDelaySec: 0,
  ...over,
});
const assess = (now: string, input: QuoteInput, limits: FreshnessLimits = L) => assessQuote(input, Z(now), limits);

// ─── Session calendar ───────────────────────────────────────────────────────
// 2026-10-15 is a Thursday, EDT (UTC-4).
check('session: 10:30 ET Thu is REGULAR', equitySession(Z('2026-10-15T14:30:00Z')).session === 'REGULAR');
check('session: 08:00 ET Thu is PRE', equitySession(Z('2026-10-15T12:00:00Z')).session === 'PRE');
check('session: 17:00 ET Thu is POST', equitySession(Z('2026-10-15T21:00:00Z')).session === 'POST');
check('session: 21:00 ET Thu is CLOSED', equitySession(Z('2026-10-16T01:00:00Z')).session === 'CLOSED');
check('session: Saturday is CLOSED', equitySession(Z('2026-10-17T16:00:00Z')).session === 'CLOSED');
check('session: Thanksgiving is CLOSED', equitySession(Z('2026-11-26T17:00:00Z')).session === 'CLOSED');
{
  const s = equitySession(Z('2026-11-27T18:30:00Z')); // 13:30 EST, early-close day
  check('session: early close — 13:30 ET is POST', s.session === 'POST' && s.earlyClose && s.closeMin === 13 * 60);
}
// DST ended 2026-11-01: 09:45 EST is 14:45Z, and 13:45Z is 08:45 EST.
check('session: DST — 14:45Z on 2026-11-02 is REGULAR', equitySession(Z('2026-11-02T14:45:00Z')).session === 'REGULAR');
check('session: DST — 13:45Z on 2026-11-02 is PRE', equitySession(Z('2026-11-02T13:45:00Z')).session === 'PRE');
check('session: previous trading day of Mon is Fri', previousTradingDay('2026-10-19') === '2026-10-16');
check('session: previous trading day of Fri after Thanksgiving is Wed', previousTradingDay('2026-11-27') === '2026-11-25');
check('session: trading days Wed→Fri over Thanksgiving = 1', tradingDaysBetween('2026-11-25', '2026-11-27') === 1);
{
  const s = equitySession(Z('2026-10-15T12:00:00Z'));
  check('session: pre-market last completed session is yesterday', s.lastCompletedSession === '2026-10-14');
}

// ─── Registry and exchanges ────────────────────────────────────────────────
check('registry: EA is inactive', isInactive('ea'));
check('registry: curated tickers have no duplicates', new Set(CURATED_TICKERS).size === CURATED_TICKERS.length);
check('registry: curated tickers exclude inactive symbols', CURATED_TICKERS.every((s) => !isInactive(s)));
check('registry: every curated row is listed once', new Set(CURATED_UNIVERSE.map((s) => s.symbol)).size === CURATED_UNIVERSE.length);
{
  const p = partitionUniverse([' aapl', 'AAPL', 'sq', 'bad symbol', 'EA']);
  check('registry: partition dedupes and splits inactive', p.active.join() === 'AAPL' && p.inactive.map((r) => r.symbol).join() === 'SQ,EA');
}
check('exchanges: Yahoo NMS → NASDAQ', exchangeFromYahoo('NMS') === 'NASDAQ');
check('exchanges: Tradier P → NYSE_ARCA', exchangeFromTradier('p') === 'NYSE_ARCA');
check('exchanges: unknown Yahoo code is not guessed', exchangeFromYahoo('XXX') === null);
check('exchanges: SPY on Arca → AMEX:SPY', tradingViewSymbol('SPY', 'NYSE_ARCA') === 'AMEX:SPY');
check('exchanges: SET strips .BK', tradingViewSymbol('EA.BK', 'SET') === 'SET:EA');
check('exchanges: unknown venue gives no TV symbol', tradingViewSymbol('EA', null) === null);

// ─── Freshness: limits config ──────────────────────────────────────────────
check('limits: defaults resolve unchanged with empty env', JSON.stringify(resolveFreshnessLimits({}, {})) === JSON.stringify(DEFAULT_FRESHNESS_LIMITS));
check('limits: env var overrides default', resolveFreshnessLimits({}, { MARKET_DATA_REGULAR_MAX_AGE_SEC: '3600' }).regularMaxAgeSec === 3600);
{
  const origWarn = console.warn;
  console.warn = () => {};
  check('limits: invalid env var is ignored', resolveFreshnessLimits({}, { MARKET_DATA_REGULAR_MAX_AGE_SEC: 'abc' }).regularMaxAgeSec === L.regularMaxAgeSec);
  check('limits: negative env var is ignored', resolveFreshnessLimits({}, { MARKET_DATA_OPEN_GRACE_SEC: '-5' }).openGraceSec === L.openGraceSec);
  console.warn = origWarn;
}
check('limits: explicit override beats env', resolveFreshnessLimits({ regularMaxAgeSec: 120 }, { MARKET_DATA_REGULAR_MAX_AGE_SEC: '3600' }).regularMaxAgeSec === 120);
check('limits: negative override throws', throws(() => resolveFreshnessLimits({ regularMaxAgeSec: -1 }, {})));
check('limits: NaN override throws', throws(() => resolveFreshnessLimits({ extendedMaxAgeSec: NaN }, {})));
check('limits: live > regular throws', throws(() => resolveFreshnessLimits({ liveMaxAgeSec: 1000, regularMaxAgeSec: 500 }, {})));

// ─── Freshness: regular session (10:30 ET Thu) ─────────────────────────────
const REG = '2026-10-15T14:30:00Z';
{
  const r = assess(REG, q({ at: '2026-10-15T14:29:30Z' }));
  check('regular: 30s old, real-time → live', r.state === 'live' && r.usable && !r.stale, r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:25:00Z', declaredDelaySec: null }));
  check('regular: 5 min old, delay unstated → delayed, usable', r.state === 'delayed' && r.usable, r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:15:00Z' }));
  check('regular: exactly at 15 min limit → still usable', r.state === 'delayed' && r.usable, r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:14:00Z' }));
  check('regular: 16 min old → stale', r.state === 'stale' && r.stale && !r.usable && r.limitSec === 900, r);
}
{
  const r = assess(REG, q({ at: '2026-10-14T20:00:00Z' }));
  check('regular: yesterday’s close an hour into the session → stale', r.state === 'stale', r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:24:00Z' }), { ...L, regularMaxAgeSec: 300 });
  check('regular: configured 5 min limit flags a 6 min quote stale', r.state === 'stale' && r.limitSec === 300, r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:00:00Z' }), resolveFreshnessLimits({}, { MARKET_DATA_REGULAR_MAX_AGE_SEC: '3600' }));
  check('regular: env-configured 60 min limit accepts a 30 min quote', r.state === 'delayed', r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:29:00Z', declaredDelaySec: 30 * 60 }));
  check('regular: provider delay over limit → stale', r.state === 'stale', r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:31:00Z' }));
  check('regular: 60s in the future is clock skew → live', r.state === 'live' && r.ageSec === 0, r);
}
{
  const r = assess(REG, q({ at: '2026-10-15T14:40:00Z' }));
  check('regular: 10 min in the future → unavailable', r.state === 'unavailable', r);
}

// Open grace: 09:32 ET, quote is yesterday's close.
{
  const r = assess('2026-10-15T13:32:00Z', q({ at: '2026-10-14T20:00:00Z' }));
  check('open grace: 2 min after open, prior close → closed (awaiting first trade)', r.state === 'closed' && r.usable, r);
}
{
  const r = assess('2026-10-15T13:40:00Z', q({ at: '2026-10-14T20:00:00Z' }));
  check('open grace: 10 min after open, prior close → stale', r.state === 'stale', r);
}
{
  const r = assess('2026-10-15T13:32:00Z', q({ at: '2026-10-13T20:00:00Z' }));
  check('open grace: does not cover a quote two sessions old', r.state === 'stale', r);
}

// ─── Extended hours ────────────────────────────────────────────────────────
{
  const r = assess('2026-10-15T12:00:00Z', q({ at: '2026-10-14T23:00:00Z' }));
  check('pre-market: last trade from yesterday’s session → closed', r.state === 'closed' && r.usable, r);
}
{
  const r = assess('2026-10-15T12:00:00Z', q({ at: '2026-10-15T11:40:00Z' }));
  check('pre-market: trade 20 min ago → delayed', r.state === 'delayed', r);
}
{
  const r = assess('2026-10-15T12:00:00Z', q({ at: '2026-10-13T20:00:00Z' }));
  check('pre-market: trade from two sessions ago → stale', r.state === 'stale', r);
}
{
  const r = assess('2026-10-15T21:00:00Z', q({ at: '2026-10-15T20:00:00Z' }));
  check('after-hours: trade 60 min ago (at limit) → delayed', r.state === 'delayed', r);
}
{
  const r = assess('2026-10-15T21:00:00Z', q({ at: '2026-10-15T19:30:00Z' }));
  check('after-hours: no extended trade, today’s session → closed', r.state === 'closed', r);
}
{
  const r = assess('2026-11-27T18:30:00Z', q({ at: '2026-11-27T18:00:00Z' }));
  check('early close: 13:30 ET, trade at 13:00 → delayed after-hours', r.state === 'delayed' && r.session === 'POST', r);
}

// ─── Market closed ─────────────────────────────────────────────────────────
{
  const r = assess('2026-10-17T16:00:00Z', q({ at: '2026-10-16T20:00:00Z' }));
  check('weekend: Friday close → closed', r.state === 'closed' && r.usable, r);
}
{
  const r = assess('2026-10-17T16:00:00Z', q({ at: '2026-10-16T23:30:00Z' }));
  check('weekend: Friday after-hours trade → closed', r.state === 'closed', r);
}
{
  const r = assess('2026-10-17T16:00:00Z', q({ at: '2026-10-15T20:00:00Z' }));
  check('weekend: Thursday close → stale', r.state === 'stale', r);
}
{
  const r = assess('2026-10-17T16:00:00Z', q({ at: '2026-10-15T20:00:00Z' }), { ...L, closedMaxSessionsBehind: 1 });
  check('weekend: closedMaxSessionsBehind=1 accepts Thursday', r.state === 'closed', r);
}
{
  const r = assess('2026-11-26T17:00:00Z', q({ at: '2026-11-25T21:00:00Z' }));
  check('holiday: Thanksgiving, Wednesday close → closed', r.state === 'closed', r);
}
{
  const r = assess('2026-10-16T01:00:00Z', q({ at: '2026-10-15T20:00:00Z' }));
  check('overnight: today’s close → closed', r.state === 'closed', r);
}
{
  const r = assess('2026-10-19T12:00:00Z', q({ at: '2026-10-16T20:00:00Z' }));
  check('monday pre-market: Friday close → closed', r.state === 'closed', r);
}

// ─── Registry / venue wiring ──────────────────────────────────────────────
{
  const r = assess(REG, q({ symbol: 'EA', at: '2026-10-15T14:29:50Z' }));
  check('registry: delisted EA with a fresh-looking quote → inactive, not usable', r.state === 'inactive' && r.stale && !r.usable, r);
}
{
  const r = assess(REG, q({ symbol: 'SQ', exchange: 'NYQ', at: '2026-10-15T14:29:50Z' }));
  check('registry: renamed SQ names successor XYZ', r.state === 'inactive' && r.detail.includes('XYZ'), r);
}
{
  const r = assess(REG, q({ symbol: 'EA', exchange: 'SET', at: '2026-10-15T14:29:50Z' }));
  check('registry: inactive record wins even with a foreign venue', r.state === 'inactive', r);
}
{
  const r = assess(REG, q({ symbol: 'PTT.BK', exchange: 'SET', at: '2026-10-15T14:29:50Z' }));
  check('venue: Thai listing → unverified (no calendar)', r.state === 'unverified' && !r.usable, r);
}
{
  const r = assess(REG, q({ symbol: 'ZZZZ', exchange: null, at: '2026-10-15T14:29:50Z' }));
  check('venue: unknown symbol, no venue → unverified', r.state === 'unverified', r);
}
{
  const r = assess(REG, q({ symbol: 'ZZZZ', exchange: 'NMS', at: '2026-10-15T14:29:50Z' }));
  check('venue: non-curated symbol with a known venue is still judged', r.state === 'live', r);
}
{
  const r = assess(REG, q({ symbol: 'AAPL', exchange: null, at: '2026-10-15T14:29:50Z' }));
  check('venue: curated symbol falls back to the registry venue', r.state === 'live' && r.exchange === 'NASDAQ', r);
}
{
  const r = assess(REG, q({ symbol: 'AAPL', exchange: 'NYQ', at: '2026-10-15T14:29:50Z' }));
  check('venue: provider venue disagrees with registry → mismatch, not usable', r.exchangeMismatch && !r.usable, r);
}
{
  const r = assess(REG, q({ symbol: 'WMT', exchange: 'NYQ', at: '2026-10-15T14:29:50Z' }));
  check('venue: registry venue left open (WMT) → provider decides, no mismatch', !r.exchangeMismatch && r.usable, r);
}
{
  const r = assess(REG, q({ price: null, at: '2026-10-15T14:29:50Z' }));
  check('input: no price → unavailable', r.state === 'unavailable', r);
}
{
  const r = assess(REG, { symbol: 'AAPL', price: 200, lastTradeMs: null, exchange: 'NMS' });
  check('input: no timestamp → unavailable', r.state === 'unavailable', r);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll market data checks passed.');
