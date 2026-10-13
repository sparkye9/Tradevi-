/**
 * Deterministic checks for the trading calculators added in the audit:
 * contract specs, position sizing, backtest execution rules, quote freshness,
 * prop-firm consistency / drawdown / payout, market structure, setups and the
 * Power Hour engine. Run: npx tsx scripts/check-trading.ts
 */
import { CONTRACTS, contractSpec, roundToTick } from '../lib/contracts';
import { calcFuturesRisk, ticksBetween } from '../lib/futuresRisk';
import { runBacktest, singleTargetExit, statsFor } from '../lib/backtest';
import { classifyQuote, marketOpenFor } from '../lib/quoteFreshness';
import { earlyCloseOn, holidayOn } from '../lib/marketHolidays';
import { parseYahooBars, type YFCandle } from '../lib/yahooChart';
import { takeToken } from '../lib/rateLimit';
import { redactPayload } from '../lib/tradingview';
import { runSection as propFirmChecks } from './check-propfirm';
import { runSection as structureChecks } from './check-structure';

let failed = 0;
export function check(name: string, cond: boolean) {
  if (cond) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ─── Contract specs ─────────────────────────────────────────────────────────
const expected: [string, number, number, number][] = [
  // symbol, tick size, tick value, point value
  ['ES', 0.25, 12.5, 50], ['MES', 0.25, 1.25, 5],
  ['NQ', 0.25, 5, 20], ['MNQ', 0.25, 0.5, 2],
  ['YM', 1, 5, 5], ['MYM', 1, 0.5, 0.5],
  ['RTY', 0.1, 5, 50], ['M2K', 0.1, 0.5, 5],
  ['GC', 0.1, 10, 100], ['MGC', 0.1, 1, 10],
  ['SI', 0.005, 25, 5000], ['SIL', 0.005, 5, 1000],
  ['CL', 0.01, 10, 1000], ['MCL', 0.01, 1, 100],
  ['ZN', 0.015625, 15.625, 1000],
];
for (const [sym, ts, tv, pv] of expected) {
  const c = contractSpec(sym)!;
  check(`${sym} spec: tick ${ts} = $${tv}, point $${pv}`, c && near(c.tickSize, ts) && near(c.tickValue, tv) && near(c.pointValue, pv, 1e-6));
}
check('micro point value is exactly 1/10 of standard for MNQ/MES/MYM/M2K/MGC/MCL', [['MNQ', 'NQ'], ['MES', 'ES'], ['MYM', 'YM'], ['M2K', 'RTY'], ['MGC', 'GC'], ['MCL', 'CL']].every(([m, s]) => near(CONTRACTS[m].pointValue * 10, CONTRACTS[s].pointValue, 1e-9)));
check('every micro proxies its parent price series', Object.values(CONTRACTS).filter((c) => c.parent).every((c) => c.priceProxy === CONTRACTS[c.parent!].priceProxy));
check('roundToTick snaps 21000.13 to 21000.25 on NQ', roundToTick(21000.13, 0.25) === 21000.25);
check('roundToTick snaps 21000.12 to 21000.00 on NQ', roundToTick(21000.12, 0.25) === 21000);

// ─── Position sizing ────────────────────────────────────────────────────────
check('ticksBetween 20 points on NQ = 80 ticks', ticksBetween(21000, 20980, 0.25).ticks === 80);
check('ticksBetween off-grid 19.9 pts rounds up to 80 ticks and flags', (() => { const r = ticksBetween(21000, 20980.1, 0.25); return r.ticks === 80 && r.offGrid; })());

{
  // MNQ long 21000 → stop 20980 = 20 pts = 80 ticks × $0.50 = $40/contract. 1% of $50,000 = $500 → 12 contracts.
  const r = calcFuturesRisk({ contract: 'MNQ', accountBalance: 50_000, riskMode: 'percent', riskValue: 1, entry: 21000, stop: 20980, targets: [21040, 21060] });
  check('MNQ: 20 pt stop = 80 ticks', r.ok && r.stopTicks === 80 && r.stopPoints === 20);
  check('MNQ: $40 risk per contract', r.riskPerContract === 40);
  check('MNQ: 1% of $50k = $500 budget → 12 contracts (floor, not 12.5 → 13)', r.riskBudget === 500 && r.maxContracts === 12);
  check('MNQ: estimated loss $480 ≤ budget', r.estimatedLoss === 480 && !r.exceedsLimit);
  check('MNQ: TP1 40 pts = $80/contract, 2R gross', r.targets[0].grossPerContract === 80 && r.targets[0].rrGross === 2);
  check('MNQ: TP2 60 pts = 3R gross; ×12 = $1,440', r.targets[1].rrGross === 3 && r.targets[1].netTotal === 1440);
  check('MNQ: side detected as long', r.side === 'long');
}
{
  // Same trade on NQ: $400/contract → 1 contract.
  const r = calcFuturesRisk({ contract: 'NQ', accountBalance: 50_000, riskMode: 'percent', riskValue: 1, entry: 21000, stop: 20980 });
  check('NQ: same stop is $400/contract → 1 contract', r.riskPerContract === 400 && r.maxContracts === 1);
}
{
  // Fees and slippage reduce size: $40 + 2 ticks ($1) + $1.24 RT = $42.24 → floor(500 / 42.24) = 11.
  const r = calcFuturesRisk({ contract: 'MNQ', accountBalance: 50_000, riskMode: 'percent', riskValue: 1, entry: 21000, stop: 20980, feesPerContractRoundTrip: 1.24, slippageTicks: 2, targets: [21040] });
  check('MNQ with fees+slippage: $42.24/contract → 11 contracts', r.riskPerContract === 42.24 && r.maxContracts === 11);
  check('MNQ net R:R after costs < gross R:R', r.targets[0].rrNet < r.targets[0].rrGross && r.targets[0].netPerContract === 78.76);
}
{
  // Short ES: entry 5000, stop 5003 = 12 ticks = $150. $300 fixed → 2 contracts.
  const r = calcFuturesRisk({ contract: 'ES', accountBalance: 25_000, riskMode: 'dollars', riskValue: 300, entry: 5000, stop: 5003, targets: [4994] });
  check('ES short: 12 ticks, $150/contract, 2 contracts', r.side === 'short' && r.stopTicks === 12 && r.riskPerContract === 150 && r.maxContracts === 2);
  check('ES short target 6 pts = 2R', r.targets[0].rrGross === 2);
}
{
  const r = calcFuturesRisk({ contract: 'ES', accountBalance: 25_000, riskMode: 'dollars', riskValue: 100, entry: 5000, stop: 4990 });
  check('ES: $500 risk vs $100 budget → 0 contracts and a warning', r.maxContracts === 0 && r.warnings.some((w) => /consider the micro/.test(w)));
}
{
  const r = calcFuturesRisk({ contract: 'MES', accountBalance: 10_000, riskMode: 'percent', riskValue: 1, entry: 5000, stop: 4990, plannedContracts: 3 });
  check('planned size above limit is flagged (3 × $50 > $100)', r.exceedsLimit && r.warnings.some((w) => /RISK LIMIT EXCEEDED/.test(w)));
}
{
  // ZN: tick 1/64 = $15.625. 16 ticks = 0.25 pts = $250. Mills math must be exact.
  const r = calcFuturesRisk({ contract: 'ZN', accountBalance: 100_000, riskMode: 'dollars', riskValue: 1000, entry: 110.5, stop: 110.25 });
  check('ZN: 0.25 pt = 16 ticks = $250 exactly → 4 contracts', r.stopTicks === 16 && r.riskPerContract === 250 && r.maxContracts === 4);
}
{
  const bad = calcFuturesRisk({ contract: 'MNQ', accountBalance: -1, riskMode: 'percent', riskValue: 1, entry: 21000, stop: 21000 });
  check('invalid inputs return errors, not numbers', !bad.ok && bad.errors.length >= 2 && bad.maxContracts === 0);
  const wrongTarget = calcFuturesRisk({ contract: 'MNQ', accountBalance: 50_000, riskMode: 'percent', riskValue: 1, entry: 21000, stop: 20980, targets: [20950] });
  check('target on the wrong side is ignored with a warning', wrongTarget.targets.length === 0 && wrongTarget.warnings.some((w) => /wrong side/.test(w)));
  check('unknown contract is an error', !calcFuturesRisk({ contract: 'XYZ', accountBalance: 1, riskMode: 'dollars', riskValue: 1, entry: 2, stop: 1 }).ok);
}

// ─── Backtest execution rules ───────────────────────────────────────────────
const bar = (i: number, o: number, h: number, l: number, c: number): YFCandle => ({ time: 1_700_000_000 + i * 86400, open: o, high: h, low: l, close: c, volume: 0 });
{
  // Long entry 100, stop 95, target 110. Fill bar also prints 112 — must NOT count as a win.
  const candles = [bar(0, 100, 101, 99, 100), bar(1, 101, 112, 99.5, 108), bar(2, 108, 109, 106, 107), bar(3, 107, 108, 106, 106)];
  const e = singleTargetExit(candles, 'long', 100, 95, 110, 1, 3);
  check('fill-bar target is not credited (ambiguous order)', e.reason === 'timeout');
  check('time-stop marks to the close (106 → +1.2R), not 0R', near(e.r, 1.2, 1e-9));
  const stopFirst = singleTargetExit([bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 111, 94, 100)], 'long', 100, 95, 110, 1, 2);
  check('bar spanning stop and target counts as stop', stopFirst.reason === 'stop' && stopFirst.r === -1);
  const fillStop = singleTargetExit([bar(0, 100, 100, 100, 100), bar(1, 100, 101, 94, 96)], 'long', 100, 95, 110, 1, 1);
  check('stop CAN trigger on the fill bar', fillStop.reason === 'stop');
}
{
  const s = statsFor('x', [1, -1, 0, -1, -1, 2]);
  check('stats: scratch (0R) is neither win nor loss', s.wins === 2 && s.losses === 3 && s.scratches === 1);
  check('stats: max consecutive losses = 2', s.maxConsecutiveLosses === 2);
  check('stats: max drawdown = 3R (peak +1 → trough −2)', s.maxDrawdownR === 3);
}
{
  // Zig-zag uptrend: trades must never overlap.
  const ext: { idx: number; price: number }[] = [];
  let idx = 2, price = 100;
  for (let leg = 0; leg < 40; leg++) {
    ext.push({ idx, price });
    idx += 4;
    price += leg % 2 === 0 ? 6 : -3;
  }
  const candles: YFCandle[] = [];
  for (let k = 0; k < ext.length - 1; k++) {
    const a = ext[k], b = ext[k + 1];
    for (let j = a.idx; j < b.idx; j++) {
      const p = a.price + ((b.price - a.price) * (j - a.idx)) / (b.idx - a.idx);
      candles.push({ time: 1_700_000_000 + candles.length * 86400, open: p, high: p + 0.6, low: p - 0.6, close: p, volume: 0 });
    }
  }
  const res = runBacktest({ instrument: 'MNQ', dataSymbol: 'NQ=F', candles, useWeeklyFilter: false });
  const filled = res.trades.filter((t) => t.fillTime != null);
  const overlap = filled.some((t, k) => k > 0 && t.signalTime < (filled[k - 1].exitTime ?? 0));
  check('backtest: no new signal while a position is open', !overlap);
  check('backtest: in-sample + out-of-sample = all fills', res.split.inSample.trades + res.split.outOfSample.trades === res.ordersFilled);
  check('backtest: monthly rows sum to the fill count', res.monthly.reduce((s, m) => s + m.trades, 0) === res.ordersFilled);
  check('backtest: small sample is flagged', res.ordersFilled >= 30 || Boolean(res.sampleWarning));
  const withCosts = runBacktest({ instrument: 'MNQ', dataSymbol: 'NQ=F', candles, useWeeklyFilter: false, costs: { contract: 'MNQ', feesRoundTrip: 1.5, slippageTicks: 1 } });
  check('backtest: costs never improve total R', withCosts.tp1Strategy.totalR <= res.tp1Strategy.totalR + 1e-9);
  check('backtest: $ P&L per contract reported when costs set', withCosts.netProfitPerContractTp1 != null && res.netProfitPerContractTp1 == null);
}

// ─── Yahoo bar parser ───────────────────────────────────────────────────────
{
  const bars = parseYahooBars([1, 2, 3, 4], [10, 10, 10, null], [11, null, 9, 11], [9, 9, 9.5, 9], [10.5, 10, 10, 10], [1, 1, 1, 1]);
  check('Yahoo parser drops null high, high<close, and null open bars', bars.length === 1 && bars[0].time === 1);
}

// ─── Quote freshness ────────────────────────────────────────────────────────
{
  const tue = new Date('2026-10-13T15:00:00Z'); // Tue 11:00 AM ET
  const sat = new Date('2026-10-17T15:00:00Z');
  check('Globex open Tue 11 AM ET, closed Saturday', marketOpenFor('globex', tue) && !marketOpenFor('globex', sat));
  check('crypto always open', marketOpenFor('24x7', sat));
  const fresh = classifyQuote({ price: 1, quoteTimeSec: tue.getTime() / 1000 - 600, now: tue, hours: 'globex', delayMinutes: 10 });
  check('10-min old quote with 10-min provider delay = delayed', fresh.state === 'delayed');
  const stale = classifyQuote({ price: 1, quoteTimeSec: tue.getTime() / 1000 - 45 * 60, now: tue, hours: 'globex', delayMinutes: 10 });
  check('45-min old quote while open = STALE', stale.state === 'stale');
  const closed = classifyQuote({ price: 1, quoteTimeSec: sat.getTime() / 1000 - 86400, now: sat, hours: 'globex', delayMinutes: 10 });
  check('weekend quote = closed, not stale', closed.state === 'closed');
  check('missing price = unavailable', classifyQuote({ price: null, quoteTimeSec: 1, now: tue, hours: 'globex', delayMinutes: 0 }).state === 'unavailable');
  check('unknown provider delay is treated as delayed, never live', classifyQuote({ price: 1, quoteTimeSec: tue.getTime() / 1000, now: tue, hours: 'globex', delayMinutes: null }).state === 'delayed');
}

// ─── Calendar ───────────────────────────────────────────────────────────────
check('2026-11-27 is an early close', earlyCloseOn('2026-11-27')?.name === 'Day after Thanksgiving');
check('2027-12-31 is not a holiday', holidayOn('2027-12-31') === null);

// ─── Security helpers ───────────────────────────────────────────────────────
{
  const opts = { capacity: 2, perMinute: 60 };
  const t0 = 1_000_000;
  const a = takeToken('t:1', opts, t0), b = takeToken('t:1', opts, t0), c = takeToken('t:1', opts, t0);
  check('rate limiter allows the burst then blocks', a.allowed && b.allowed && !c.allowed && c.retryAfterSec >= 1);
  check('rate limiter refills over time', takeToken('t:1', opts, t0 + 2000).allowed);
  const red = redactPayload({ secret: 'abc', symbol: 'MNQ', message: 'x' });
  check('webhook payload is stored without the secret', !('secret' in red) && red.symbol === 'MNQ');
}

propFirmChecks(check);
structureChecks(check);

if (failed) {
  console.error(`\n${failed} trading check(s) failed`);
  process.exit(1);
}
console.log('\nall trading checks passed');
