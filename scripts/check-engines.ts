/**
 * Focused checks for the Globex clock, holiday calendar, and stocks quality engine.
 * Run: npx tsx scripts/check-engines.ts
 */
import { holidayOn, isCmeClosed, isUsCashHoliday } from '../lib/marketHolidays';
import { marketClock } from '../lib/powerHour';
import { stockQuality, smaTrendAligned, intradayTape } from '../lib/stockQuality';
import {
  parseFfEvent,
  parseFfCalendar,
  eventPrinted,
  upcomingHighImpact,
  groupByEtDay,
} from '../lib/economicCalendar';
import type { FinvizQuote } from '../lib/finviz';
import { dealingRangeSetup, intradayAction } from '../lib/futuresSetups';
import { classify, structureLevels, swingSuggestion, setupQuality, type TrendRead, type Timeframe } from '../lib/trendBias';
import { runBacktest } from '../lib/backtest';
import type { YFCandle } from '../lib/yahooChart';
import { atr, efficiencyRatio, adx, dmi, fractalPivots, resampleWeekly, resampleMonthly, isoWeekKey } from '../lib/indicators';
import { computeReadiness, scoreReadiness, gradeFor, newsGate, freshnessGate, type ReadinessInput } from '../lib/readiness';
import { READINESS_CONFIG } from '../lib/readinessConfig';

let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function quote(partial: Partial<FinvizQuote>): FinvizQuote {
  return {
    symbol: 'TEST',
    rvol: null,
    unusualVolume: false,
    newHighDay: false,
    changePercent: null,
    gap: null,
    sma20rel: null,
    sma50rel: null,
    sma200rel: null,
    avgVolume: null,
    float: null,
    sector: null,
    industry: null,
    groupStrength: null,
    price: 10,
    lastUpdated: '',
    ...partial,
  };
}

// Holidays
check('Christmas 2025 is CME closed', isCmeClosed('2025-12-25'));
check('Good Friday 2025 is CME closed', isCmeClosed('2025-04-18'));
check('NYD 2025 is CME closed', isCmeClosed('2025-01-01'));
check('MLK 2025 is cash holiday not CME close', isUsCashHoliday('2025-01-20') && !isCmeClosed('2025-01-20'));
check('random Tuesday is not a holiday', holidayOn('2025-01-14') === null);
check('2028 NYD observed Friday 2027-12-31', isCmeClosed('2027-12-31'));

// Clock windows (ISO instants chosen so ET is unambiguous)
const xmas = marketClock(new Date('2025-12-25T20:00:00.000Z')); // Thu 15:00 EST
check('Christmas afternoon is Holiday / closed', xmas.session === 'Holiday' && xmas.tradesOpen === false && xmas.powerHour === false);

const gf = marketClock(new Date('2025-04-18T19:00:00.000Z')); // Fri 15:00 EDT
check('Good Friday afternoon is Holiday / closed', gf.session === 'Holiday' && gf.tradesOpen === false);

const mlk = marketClock(new Date('2025-01-20T20:00:00.000Z')); // Mon 15:00 EST (would be Power Hour)
check('MLK Globex stays open', mlk.tradesOpen === true);
check('MLK Power Hour is off', mlk.powerHour === false);
check('MLK cash is closed', mlk.cashOpen === false && mlk.holidayName === "Martin Luther King Jr. Day");

const power = marketClock(new Date('2025-01-14T20:30:00.000Z')); // Tue 15:30 EST
check('regular Tuesday 3:30 PM is Power Hour', power.powerHour === true && power.tradesOpen === true && power.cashOpen === true);

const cashOpen = marketClock(new Date('2025-01-14T15:00:00.000Z')); // Tue 10:00 EST
check('regular Tuesday 10:00 AM cash is open', cashOpen.cashOpen === true && cashOpen.tradesOpen === true && cashOpen.powerHour === false);

const sat = marketClock(new Date('2025-01-18T20:00:00.000Z'));
check('Saturday is Weekend', sat.session === 'Weekend' && sat.tradesOpen === false);

const halt = marketClock(new Date('2025-01-14T22:30:00.000Z')); // Tue 17:30 EST
check('Tue 5:30 PM is daily halt', halt.session === 'Maintenance' && halt.tradesOpen === false);

const sundayClosed = marketClock(new Date('2025-01-19T20:00:00.000Z')); // Sun 15:00 EST
check('Sunday 3 PM is still closed', sundayClosed.session === 'Weekend' && sundayClosed.tradesOpen === false);

const sundayOpen = marketClock(new Date('2025-01-19T23:30:00.000Z')); // Sun 18:30 EST
check('Sunday 6:30 PM Asia is open', sundayOpen.tradesOpen === true && sundayOpen.venues.includes('Asia'));

// Stocks quality
const look = stockQuality(
  quote({
    rvol: 3.2,
    sma50rel: 'above',
    sma200rel: 'above',
    changePercent: 1.4,
    unusualVolume: true,
  }),
  1.5,
);
check('volume + SMA up + green is LOOK long', look.label === 'LOOK' && look.side === 'long');
check('LOOK long is SMA-aligned for swing', smaTrendAligned(quote({ sma50rel: 'above', sma200rel: 'above' })));
check('LOOK with RVOL 3 is intraday tape', intradayTape(quote({ rvol: 3.2 }), 1.5));

const noTrade = stockQuality(
  quote({
    rvol: 0.8,
    sma50rel: 'above',
    sma200rel: 'below',
    changePercent: 0.1,
  }),
  1.5,
);
check('weak RVOL + mixed SMA is NO TRADE', noTrade.label === 'NO_TRADE' && noTrade.side === 'none');

const mixed = stockQuality(
  quote({
    rvol: 2.0,
    sma50rel: 'above',
    sma200rel: 'below',
    changePercent: 0.2,
  }),
  1.5,
);
check('volume without a side is NO TRADE', mixed.label === 'NO_TRADE');

const cpi = parseFfEvent({
  title: 'CPI y/y',
  country: 'USD',
  date: '2026-08-12T08:30:00-04:00',
  impact: 'High',
  forecast: '3.4%',
  previous: '3.5%',
});
check('parses a Forex Factory CPI row', Boolean(cpi && cpi.country === 'USD' && cpi.impact === 'High' && cpi.forecast === '3.4%'));
check('drops a row with no title', parseFfEvent({ country: 'USD', date: '2026-08-12T08:30:00-04:00' }) === null);
check('drops a garbage payload', parseFfCalendar({ events: [] }).length === 0);

const week = parseFfCalendar([
  { title: 'CPI y/y', country: 'USD', date: '2026-08-12T08:30:00-04:00', impact: 'High', forecast: '3.4%', previous: '3.5%' },
  { title: 'Retail Sales', country: 'USD', date: '2026-08-14T08:30:00-04:00', impact: 'Medium', forecast: '', previous: '' },
  { title: 'Cash Rate', country: 'AUD', date: '2026-08-11T00:30:00-04:00', impact: 'High', forecast: '4.35%', previous: '4.35%' },
]);
check('keeps three valid events', week.length === 3);
check('CPI is printed after the scheduled time', eventPrinted(week[1].at, new Date('2026-08-12T13:00:00.000Z')));
check('groups by ET day', groupByEtDay(week).length === 3);

const upcoming = upcomingHighImpact(week, new Date('2026-08-10T12:00:00.000Z'), 5);
check('upcoming high-impact keeps AUD then USD', upcoming.length === 2 && upcoming[0].country === 'AUD' && upcoming[1].title === 'CPI y/y');

const longLook = dealingRangeSetup({
  action: 'LOOK_LONG',
  lastPrice: 90,
  high: 120,
  low: 80,
  equilibrium: 100,
  invalidation: 80,
  zone: 'discount',
});
check('discount long entry is last price', longLook.status === 'look' && longLook.entry === 90 && longLook.stop === 80);
check('discount long TP1 is EQ and TP2 is high', longLook.tp1 === 100 && longLook.tp2 === 120);

const longWait = dealingRangeSetup({
  action: 'LOOK_LONG',
  lastPrice: 110,
  high: 120,
  low: 80,
  equilibrium: 100,
  invalidation: 80,
  zone: 'premium',
});
check('premium long waits at EQ', longWait.status === 'wait' && longWait.entry === 100 && longWait.tp1 === 120 && longWait.tp2 === 160);

const shortLook = dealingRangeSetup({
  action: 'LOOK_SHORT',
  lastPrice: 110,
  high: 120,
  low: 80,
  equilibrium: 100,
  invalidation: 120,
  zone: 'premium',
});
check('premium short entry is last price', shortLook.status === 'look' && shortLook.entry === 110 && shortLook.stop === 120);
check('premium short TP1 is EQ and TP2 is low', shortLook.tp1 === 100 && shortLook.tp2 === 80);

const none = dealingRangeSetup({
  action: 'STAND_DOWN',
  lastPrice: 100,
  high: 120,
  low: 80,
  equilibrium: 100,
  invalidation: null,
  zone: 'equilibrium',
});
check('stand down has no levels', none.status === 'none' && none.entry === null && none.tp1 === null);
check('15m up is look long', intradayAction({ bias: 'up', reason: 'hh/hl' }) === 'LOOK_LONG');
check('15m range is stand down', intradayAction({ bias: 'range', reason: 'mixed' }) === 'STAND_DOWN');

// Trend Bias Stack — structure engine (classify / structureLevels / suggestion / quality)

/** Piecewise-linear zigzag through alternating swing extrema, for fractal-pivot tests. */
function zigzagCandles(extrema: { idx: number; price: number }[]): YFCandle[] {
  const lastIdx = extrema[extrema.length - 1].idx;
  const len = lastIdx + 3; // trailing bars so the final pivot gets k=2 confirmation
  const z: number[] = new Array(len).fill(extrema[0].price);
  for (let i = 0; i <= extrema[0].idx; i++) z[i] = extrema[0].price;
  for (let e = 0; e < extrema.length - 1; e++) {
    const a = extrema[e], b = extrema[e + 1];
    for (let i = a.idx; i <= b.idx; i++) {
      const t = (i - a.idx) / (b.idx - a.idx);
      z[i] = a.price + (b.price - a.price) * t;
    }
  }
  const last = extrema[extrema.length - 1];
  const prev = extrema[extrema.length - 2];
  const dir = last.price > prev.price ? -1 : 1; // continue away from the last pivot
  for (let i = last.idx + 1; i < len; i++) {
    z[i] = last.price + dir * (i - last.idx) * 0.5;
  }
  return z.map((price, i) => ({
    time: i * 86400,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1000,
  }));
}

const uptrendCandles = zigzagCandles([
  { idx: 2, price: 100 },  // L1
  { idx: 6, price: 106 },  // H1
  { idx: 10, price: 103 }, // L2 (higher low)
  { idx: 14, price: 109 }, // H2 (higher high)
  { idx: 18, price: 106 }, // L3 (higher low)
  { idx: 22, price: 112 }, // H3 (higher high)
  { idx: 26, price: 109 }, // L4 (higher low)
  { idx: 30, price: 115 }, // H4 (higher high)
]);
const downtrendCandles = zigzagCandles([
  { idx: 2, price: 115 },
  { idx: 6, price: 109 },
  { idx: 10, price: 112 },
  { idx: 14, price: 106 },
  { idx: 18, price: 109 },
  { idx: 22, price: 103 },
  { idx: 26, price: 106 },
  { idx: 30, price: 100 },
]);
const mixedCandles = zigzagCandles([
  { idx: 2, price: 100 },
  { idx: 6, price: 106 },
  { idx: 10, price: 103 }, // higher low
  { idx: 14, price: 109 }, // higher high
  { idx: 18, price: 106 }, // higher low
  { idx: 22, price: 108 }, // LOWER high vs H3 above — breaks the stack
]);

const upRead = classify(uptrendCandles);
check('uptrend zigzag classifies as up', upRead.bias === 'up');
const downRead = classify(downtrendCandles);
check('downtrend zigzag classifies as down', downRead.bias === 'down');
const mixedRead = classify(mixedCandles);
check('mixed zigzag (HL but LH) classifies as range', mixedRead.bias === 'range');

const upLevels = structureLevels(uptrendCandles, 'up', 110);
check('uptrend last swing high/low are the final confirmed pivots', upLevels.lastSwingHigh === 115 && upLevels.lastSwingLow === 109);
check('uptrend prev swing high/low are the pivots before those', upLevels.prevSwingHigh === 112 && upLevels.prevSwingLow === 106);
check('uptrend equilibrium is the mid of last swing high/low', upLevels.equilibrium === (115 + 109) / 2);
check('uptrend invalidation follows the up bias (last swing low)', upLevels.invalidation === 109);
check('last price 110 vs EQ 112 reads as discount', upLevels.zone === 'discount');

const flatReads: Record<Timeframe, TrendRead> = {
  Weekly: { bias: 'up', reason: 'hh/hl' },
  Daily: { bias: 'up', reason: 'hh/hl' },
  '4H': { bias: 'up', reason: 'hh/hl' },
};
const stackedLong = swingSuggestion('MNQ', flatReads, upLevels, upLevels, 110);
check('stacked Weekly/Daily/4H up is LOOK_LONG at high conviction', stackedLong.action === 'LOOK_LONG' && stackedLong.conviction === 'high');
check('stacked long in discount headline says look for longs now', stackedLong.headline.includes('discount'));

const conflictReads: Record<Timeframe, TrendRead> = {
  Weekly: { bias: 'up', reason: 'hh/hl' },
  Daily: { bias: 'down', reason: 'lh/ll' },
  '4H': { bias: 'down', reason: 'lh/ll' },
};
const conflictSuggestion = swingSuggestion('MNQ', conflictReads, upLevels, upLevels, 110);
check('conflicting Weekly vs Daily/4H stands down', conflictSuggestion.action === 'STAND_DOWN');

const standDownQuality = setupQuality(conflictSuggestion, conflictReads, upLevels);
check('stand-down quality is NO_TRADE with a low fixed score', standDownQuality.label === 'NO_TRADE' && standDownQuality.score === 12);

const stackedQuality = setupQuality(stackedLong, flatReads, upLevels);
check('stacked long in the right zone with invalidation is a TRADE', stackedQuality.label === 'TRADE' && stackedQuality.score > standDownQuality.score);

const wrongZoneLevels = structureLevels(uptrendCandles, 'up', 114); // near the high, not discount
const wrongZoneQuality = setupQuality(stackedLong, flatReads, wrongZoneLevels);
check('stacked long priced in premium is WAIT, not TRADE', wrongZoneQuality.label === 'WAIT');

// Backtest harness — no-lookahead walk-forward replay

const tooShort = runBacktest({ instrument: 'MNQ', dataSymbol: 'NQ=F', candles: uptrendCandles });
check('backtest on too little history reports an error, not a crash', Boolean(tooShort.error) && tooShort.signalsGenerated === 0);

// Repeat the uptrend leg pattern several times so there's enough history past WARMUP (40 bars).
const longUptrendExtrema: { idx: number; price: number }[] = [];
let idx = 2, price = 100;
for (let leg = 0; leg < 20; leg++) {
  longUptrendExtrema.push({ idx, price });
  idx += 4;
  price += leg % 2 === 0 ? 6 : -3; // net +3 every 2 legs — higher highs and higher lows
}
const longUptrendCandles = zigzagCandles(longUptrendExtrema);
const backtest = runBacktest({ instrument: 'MNQ', dataSymbol: 'NQ=F', candles: longUptrendCandles, useWeeklyFilter: false });
check('backtest on a long clean uptrend runs without an error', !backtest.error);
check('backtest generates at least one signal on a trending series', backtest.signalsGenerated > 0);
check('backtest trade log matches signals + fills accounting', backtest.trades.length === backtest.signalsGenerated);
check('fill rate is a sane percentage', backtest.fillRate >= 0 && backtest.fillRate <= 100);
check(
  'every trade has a positive risk (entry != stop)',
  backtest.trades.every((t) => t.exitReason === 'cancelled' || t.risk > 0),
);
check(
  'TP1/TP2/hybrid strategy stats are finite, not NaN',
  [backtest.tp1Strategy, backtest.tp2Strategy, backtest.hybridStrategy].every(
    (s) => Number.isFinite(s.winRate) && Number.isFinite(s.expectancyR) && Number.isFinite(s.maxDrawdownR),
  ),
);

// ─── Indicators (lib/indicators.ts) ─────────────────────────────────────────

/** Straight-line uptrend: every bar is 1 point higher, range 1, no gaps beyond 0.5. */
const lineUp: YFCandle[] = Array.from({ length: 40 }, (_, i) => ({
  time: 1_700_000_000 + i * 86400,
  open: 10 + i,
  high: 10 + i + 0.5,
  low: 10 + i - 0.5,
  close: 10 + i,
  volume: 1,
}));
// TR per bar (after the first) = max(1, |h − prevClose| = 1.5, |l − prevClose| = 0.5) = 1.5 → Wilder ATR → 1.5
// (the first bar's TR is 1.0, so the smoothed value is within 0.01 of 1.5 after 40 bars).
check('ATR14 on a constant-range line converges to 1.5', Math.abs((atr(lineUp, 14) ?? 0) - 1.5) < 0.01);
check('ER10 on a straight line is 1.0', Math.abs((efficiencyRatio(lineUp.map((c) => c.close), 10) ?? 0) - 1) < 1e-9);
// +DM = 1 every bar, −DM = 0 → +DI = 66.7, −DI = 0, DX = 100 → ADX = 100.
check('ADX14 on a straight line is 100', Math.abs((adx(lineUp, 14) ?? 0) - 100) < 1e-6);
const line = dmi(lineUp, 14);
check('+DI on the line is 66.7 and −DI is 0', Math.abs((line.diPlus[39] ?? 0) - 200 / 3) < 1e-6 && (line.diMinus[39] ?? 1) === 0);

/** Hand-computed Wilder ATR on an irregular 16-bar series. */
const irregular: YFCandle[] = [
  [10, 11, 9, 10], [10, 12, 9.5, 11.5], [11.5, 12.5, 11, 11.2], [11.2, 11.8, 10.4, 10.6], [10.6, 11.4, 10.2, 11.3],
  [11.3, 12.6, 11.1, 12.4], [12.4, 12.9, 12.0, 12.1], [12.1, 12.3, 11.0, 11.1], [11.1, 11.9, 10.8, 11.8], [11.8, 12.2, 11.5, 11.6],
  [11.6, 11.7, 10.5, 10.6], [10.6, 11.5, 10.4, 11.4], [11.4, 12.0, 11.2, 11.9], [11.9, 12.8, 11.8, 12.7], [12.7, 13.0, 12.1, 12.2],
  [12.2, 12.6, 11.6, 11.7],
].map(([open, high, low, close], i) => ({ time: 1_700_000_000 + i * 86400, open, high, low, close, volume: 1 }));
{
  // Independent reference: TR list, SMA seed over the first 14, then Wilder recursion.
  const tr = irregular.map((c, i) =>
    i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - irregular[i - 1].close), Math.abs(c.low - irregular[i - 1].close)),
  );
  let ref = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (let i = 14; i < tr.length; i++) ref = (ref * 13 + tr[i]) / 14;
  check('ATR14 matches a hand-rolled Wilder recursion', Math.abs((atr(irregular, 14) ?? 0) - ref) < 1e-9);
}
// ER10 on a zigzag that ends where it started → 0.
const zig = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
check('ER10 on a round-trip zigzag is 0', efficiencyRatio(zig, 10) === 0);
// ER10 hand value: closes 10→15 in 10 steps with one 1-point pullback: net 5, path 7 → 0.714
const partial = [10, 11, 12, 13, 12, 13, 14, 15, 14, 15, 15];
{
  const net = Math.abs(partial[10] - partial[0]);
  let path = 0;
  for (let i = 1; i < partial.length; i++) path += Math.abs(partial[i] - partial[i - 1]);
  check('ER10 on a trend with pullbacks matches net/path', Math.abs((efficiencyRatio(partial, 10) ?? 0) - net / path) < 1e-12);
}
check('ADX needs at least 2×period bars', adx(irregular, 14) === null);

const piv = fractalPivots(uptrendCandles, 2, 2);
check('fractal pivots find the zigzag highs', piv.highs.map((p) => p.price).join(',') === '106,109,112,115');
// The first low (100) sits on a flat run of equal bars, so it is not a strict pivot — same rule as trendBias.
check('fractal pivots find the zigzag lows', piv.lows.map((p) => p.price).join(',') === '103,106,109');

// Resampling: 10 daily bars from Mon 2026-10-05 ET (13:00 UTC) → 2 ISO weeks.
const dailyTwoWeeks: YFCandle[] = Array.from({ length: 10 }, (_, i) => {
  const dayOffset = i < 5 ? i : i + 2; // skip the weekend
  const t = Date.UTC(2026, 9, 5, 13) / 1000 + dayOffset * 86400;
  return { time: t, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1 };
});
const wk = resampleWeekly(dailyTwoWeeks);
check('weekly resample makes two Monday-keyed weeks', wk.length === 2 && wk[0].key === '2026-10-05' && wk[1].key === '2026-10-12');
check('weekly bar takes first open / max high / min low / last close', wk[0].open === 100 && wk[0].high === 105 && wk[0].low === 99 && wk[0].close === 104.5 && wk[0].bars === 5);
check('monthly resample keys by YYYY-MM', resampleMonthly(dailyTwoWeeks).length === 1 && resampleMonthly(dailyTwoWeeks)[0].key === '2026-10');
check('ISO week key of a Sunday is the previous Monday', isoWeekKey('2026-10-11') === '2026-10-05');

// ─── Readiness (lib/readiness.ts) ───────────────────────────────────────────

const weightTotal = Object.values(READINESS_CONFIG.weights).reduce((a, b) => a + b, 0);
check('readiness weights total 100', weightTotal === 100);

function readinessInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  const levels = structureLevels(uptrendCandles, 'up', 110);
  const trading = new Date('2025-01-14T15:00:00.000Z'); // Tue 10:00 ET, Globex open
  return {
    symbol: 'MNQ',
    now: trading,
    reads: flatReads,
    levels: { Weekly: levels, Daily: levels, '4H': levels },
    lastPrice: 110,
    dailyCandles: uptrendCandles,
    fourHCandles: uptrendCandles,
    swingSetup: dealingRangeSetup({ action: 'LOOK_LONG', lastPrice: 110, high: 115, low: 109, equilibrium: 112, invalidation: 109, zone: 'discount' }),
    newestBar: { interval: '15m', time: Math.floor(trading.getTime() / 1000) - 15 * 60 },
    events: [],
    ...overrides,
  };
}

const stackedDiscount = computeReadiness(readinessInput());
check('stacked long in discount with all gates open is grade A / READY', stackedDiscount.grade === 'A' && stackedDiscount.status === 'READY' && stackedDiscount.score >= 75);
check('readiness output has the spec fields', Array.isArray(stackedDiscount.passed) && Array.isArray(stackedDiscount.failed) && stackedDiscount.blocking_gate === null && typeof stackedDiscount.data_age_minutes === 'number');

const dailyFourHOnly = computeReadiness(readinessInput({ reads: { ...flatReads, Weekly: { bias: 'range', reason: 'mixed' } } }));
check('Daily + 4H aligned without Weekly can still be READY', dailyFourHOnly.status === 'READY');
check('missing Weekly costs exactly the weekly bonus', stackedDiscount.score - dailyFourHOnly.score === READINESS_CONFIG.weights.weeklyAgrees);

const premiumStack = computeReadiness(readinessInput({ lastPrice: 114.9, levels: (() => { const l = structureLevels(uptrendCandles, 'up', 114.9); return { Weekly: l, Daily: l, '4H': l }; })(), swingSetup: dealingRangeSetup({ action: 'LOOK_LONG', lastPrice: 114.9, high: 115, low: 109, equilibrium: 112, invalidation: 109, zone: 'premium' }) }));
check('stacked long priced in premium is WATCH (B), not READY and not NO TRADE', premiumStack.status === 'WATCH' && premiumStack.grade === 'B');
check('premium read lists the zone as a failed condition first', /premium/.test(premiumStack.failed[0] ?? ''));

const conflictOut = computeReadiness(readinessInput({ reads: conflictReads }));
check('Weekly up vs Daily/4H down scores below READY', conflictOut.status !== 'READY' && conflictOut.failed.length > 0);

const weekend = computeReadiness(readinessInput({ now: new Date('2025-01-18T20:00:00.000Z') }));
check('weekend is WAIT with the session gate blocking', weekend.status === 'WAIT' && (weekend.blocking_gate ?? '').startsWith('Session window'));

const stale = computeReadiness(readinessInput({ newestBar: { interval: '15m', time: Math.floor(new Date('2025-01-14T15:00:00.000Z').getTime() / 1000) - 3 * 3600 } }));
check('a 3-hour-old 15m bar is WAIT with "Data stale"', stale.status === 'WAIT' && /Data stale/.test(stale.blocking_gate ?? ''));

const cpiNow = newsGate(new Date('2026-08-12T12:20:00.000Z'), week); // CPI at 12:30Z
check('10 minutes before CPI is a news blackout', cpiNow.passed === false && /CPI/.test(cpiNow.detail));
check('2 hours after CPI is clear', newsGate(new Date('2026-08-12T14:30:00.000Z'), week).passed === true);
check('AUD high-impact does not black out CME', newsGate(new Date('2026-08-11T04:25:00.000Z'), week).passed === true);
check('freshness gate reports age in minutes', freshnessGate(new Date('2025-01-14T15:00:00.000Z'), { interval: '1h', time: Math.floor(new Date('2025-01-14T13:00:00.000Z').getTime() / 1000) }).age === 60);
check('grade bands: 75→A, 60→B, 59→C', gradeFor(75) === 'A' && gradeFor(60) === 'B' && gradeFor(59) === 'C');
check('score never exceeds 100', scoreReadiness(readinessInput()).score <= 100);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall engine checks passed');
