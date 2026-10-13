/**
 * Historical backtest harness for the daily dealing-range swing engine.
 *
 * Walks daily candles forward bar-by-bar with NO lookahead: at each bar close it
 * builds the exact same structure read (classify + structureLevels) and setup
 * (dealingRangeSetup) the live app would show, places the resulting entry as a
 * limit order, then simulates the fill and exit against the bars that follow.
 *
 * Execution assumptions (all conservative, all listed in `notes`):
 *  - Limit entry fills at the limit price when a later bar trades through it.
 *    A gap through the limit still fills at the limit (no price improvement).
 *  - Fill bar: only the STOP can trigger on the bar that filled the order. A
 *    daily bar cannot tell us whether the target traded before or after the
 *    fill, so targets are only credited from the next bar on.
 *  - Any bar that spans both stop and target counts as the stop.
 *  - Time-stop: a position still open after `maxBarsInTrade` bars is closed at
 *    that bar's close (marked to market — not scored as 0R).
 *  - One position at a time: the next signal is evaluated only after the
 *    position is fully closed under the slowest exit rule.
 *  - Optional costs: round-trip fees and stop / time-exit slippage in ticks,
 *    converted to R with the contract's tick size and point value.
 *
 * Scope: this tests the DAILY mechanics. The live app also gates on a 4H stack
 * and on session / news / freshness, which daily bars cannot replay. Yahoo's
 * continuous series rolls contracts on its own schedule; roll gaps are in the
 * data as-is (see marketUniverse.rollWindows).
 */
import type { YFCandle } from './yahooChart';
import { classify, structureLevels, type Bias } from './trendBias';
import { dealingRangeSetup, type TradeSide } from './futuresSetups';
import { resampleWeekly, etDate } from './indicators';
import { contractSpec } from './contracts';

const K = 2;                 // swing strictness — matches SWING_STRICTNESS in trendBias
const WARMUP = 40;           // bars needed before the structure read is meaningful
const MAX_BARS_TO_FILL = 10; // cancel a resting limit if unfilled after N bars
const MAX_BARS_IN_TRADE = 40;// time-stop an open trade after N bars
/** Below this many filled trades the stats are flagged as not meaningful. */
export const MIN_MEANINGFUL_TRADES = 30;
/** Share of the filled trades (by time) used as in-sample. */
const IN_SAMPLE_SHARE = 0.7;

export type ExitReason = 'tp1' | 'tp2' | 'stop' | 'timeout' | 'cancelled';

export interface BacktestCosts {
  /** Contract symbol for tick size / point value (e.g. 'MNQ'). */
  contract: string;
  /** Round-trip fees per contract in dollars. */
  feesRoundTrip: number;
  /** Adverse slippage in ticks on stop and time exits. */
  slippageTicks: number;
}

export interface BacktestTrade {
  side: TradeSide;
  signalStatus: 'look' | 'wait';
  signalTime: number;
  fillTime: number | null;
  exitTime: number | null;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  risk: number;
  /** Planned reward:risk to TP1 at the entry. */
  plannedRR: number;
  exitReason: ExitReason;
  rToTp1Exit: number | null;    // R multiple under a "exit all at TP1" rule
  rToTp2Exit: number | null;    // R multiple under a "exit all at TP2" rule
  rHybridExit: number | null;   // R under "half at TP1, runner to TP2 at breakeven"
  holdBarsTp1: number | null;   // trading days held under the TP1-exit rule
  holdBarsTp2: number | null;   // trading days held under the TP2-exit rule
  holdBarsHybrid: number | null;// trading days held under the hybrid rule
}

export interface StrategyStats {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;         // 0–100, wins / trades
  expectancyR: number;     // average R per trade
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
  avgWinR: number;
  avgLossR: number;
  maxConsecutiveLosses: number;
  avgHoldBars: number;     // average trading days in a trade
  medianHoldBars: number;  // median trading days in a trade
}

export interface MonthRow {
  month: string;
  trades: number;
  totalR: number;
}

export interface SplitStats {
  inSample: StrategyStats;
  outOfSample: StrategyStats;
  splitDate: string | null;
}

export interface BacktestResult {
  instrument: string;
  dataSymbol: string;
  bars: number;
  fromDate: string | null;
  toDate: string | null;
  signalsGenerated: number;
  ordersFilled: number;
  fillRate: number;        // 0–100
  tp1Strategy: StrategyStats;
  tp2Strategy: StrategyStats;
  hybridStrategy: StrategyStats;
  /** In-sample (first 70% of fills) vs out-of-sample (last 30%), TP1 exit rule. */
  split: SplitStats;
  /** Monthly R under the TP1 exit rule (by exit month, New York date). */
  monthly: MonthRow[];
  avgPlannedRR: number;
  costsApplied: boolean;
  /** Dollar value of 1R per contract is trade-specific; this is total TP1-rule P&L for 1 contract, when a contract is set. */
  netProfitPerContractTp1: number | null;
  sampleWarning: string | null;
  maxHoldBars: number;
  trades: BacktestTrade[];
  notes: string[];
  error?: string;
}

function weeklyBiasUpTo(daily: YFCandle[]): Bias {
  // ISO Monday-start weeks on New York dates (not epoch-aligned 7-day blocks).
  return classify(resampleWeekly(daily), K).bias;
}

function round(n: number, p = 2): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

export function statsFor(label: string, rs: number[], holds: number[] = []): StrategyStats {
  const trades = rs.length;
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const scratches = trades - wins.length - losses.length;
  const totalR = rs.reduce((s, r) => s + r, 0);
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));

  const holdsClean = holds.filter((h) => h != null && !Number.isNaN(h));
  const avgHoldBars = holdsClean.length ? round(holdsClean.reduce((s, h) => s + h, 0) / holdsClean.length, 1) : 0;
  const sortedHolds = [...holdsClean].sort((a, b) => a - b);
  const medianHoldBars = sortedHolds.length ? sortedHolds[Math.floor(sortedHolds.length / 2)] : 0;

  // Max drawdown of the running R equity curve, and the longest losing streak.
  let peak = 0, equity = 0, maxDd = 0, streak = 0, maxStreak = 0;
  for (const r of rs) {
    equity += r;
    if (equity > peak) peak = equity;
    maxDd = Math.max(maxDd, peak - equity);
    streak = r < 0 ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }

  return {
    label,
    trades,
    wins: wins.length,
    losses: losses.length,
    scratches,
    winRate: trades ? round((wins.length / trades) * 100, 1) : 0,
    expectancyR: trades ? round(totalR / trades) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : grossWin > 0 ? null : 0,
    totalR: round(totalR, 1),
    maxDrawdownR: round(maxDd, 1),
    avgWinR: wins.length ? round(grossWin / wins.length) : 0,
    avgLossR: losses.length ? round(grossLoss / losses.length) : 0,
    maxConsecutiveLosses: maxStreak,
    avgHoldBars,
    medianHoldBars,
  };
}

interface Exit {
  idx: number;
  /** Gross R before costs. */
  r: number;
  /** True when the exit is a market order (stop / time) that pays slippage. */
  market: boolean;
  reason: 'stop' | 'target' | 'timeout' | 'breakeven';
}

/**
 * Exit under a single-target rule. Fill bar: stop only. Same bar stop+target → stop.
 */
export function singleTargetExit(
  candles: YFCandle[], side: TradeSide, entry: number, stop: number, target: number,
  fillIdx: number, lastIdx: number,
): Exit {
  const risk = Math.abs(entry - stop);
  for (let j = fillIdx; j <= lastIdx; j++) {
    const b = candles[j];
    const stopHit = side === 'long' ? b.low <= stop : b.high >= stop;
    if (stopHit) return { idx: j, r: -1, market: true, reason: 'stop' };
    if (j === fillIdx) continue; // target order on the fill bar is ambiguous
    const tHit = side === 'long' ? b.high >= target : b.low <= target;
    if (tHit) return { idx: j, r: Math.abs(target - entry) / risk, market: false, reason: 'target' };
  }
  const close = candles[lastIdx].close;
  const r = (side === 'long' ? close - entry : entry - close) / risk;
  return { idx: lastIdx, r, market: true, reason: 'timeout' };
}

/** Hybrid: half at TP1, stop to breakeven, runner to TP2. */
function hybridExit(
  candles: YFCandle[], side: TradeSide, entry: number, stop: number, tp1: number, tp2: number,
  fillIdx: number, lastIdx: number,
): Exit & { halfAtTp1: boolean } {
  const risk = Math.abs(entry - stop);
  const first = singleTargetExit(candles, side, entry, stop, tp1, fillIdx, lastIdx);
  if (first.reason !== 'target') return { ...first, halfAtTp1: false };
  const rTp1 = first.r;
  for (let j = first.idx + 1; j <= lastIdx; j++) {
    const b = candles[j];
    const beHit = side === 'long' ? b.low <= entry : b.high >= entry;
    if (beHit) return { idx: j, r: 0.5 * rTp1, market: true, reason: 'breakeven', halfAtTp1: true };
    const t2 = side === 'long' ? b.high >= tp2 : b.low <= tp2;
    if (t2) return { idx: j, r: 0.5 * rTp1 + 0.5 * (Math.abs(tp2 - entry) / risk), market: false, reason: 'target', halfAtTp1: true };
  }
  const close = candles[lastIdx].close;
  const runner = (side === 'long' ? close - entry : entry - close) / risk;
  return { idx: lastIdx, r: 0.5 * rTp1 + 0.5 * runner, market: true, reason: 'timeout', halfAtTp1: true };
}

/** Cost of a round trip in R for one contract. */
function costR(costs: BacktestCosts | undefined, riskPoints: number, market: boolean): number {
  if (!costs) return 0;
  const spec = contractSpec(costs.contract);
  if (!spec || riskPoints <= 0) return 0;
  const feePts = costs.feesRoundTrip / spec.pointValue;
  const slipPts = market ? costs.slippageTicks * spec.tickSize : 0;
  return (feePts + slipPts) / riskPoints;
}

function emptyResult(instrument: string, dataSymbol: string, bars: number, maxHold: number, notes: string[], error: string): BacktestResult {
  const z = (l: string) => statsFor(l, []);
  return {
    instrument, dataSymbol, bars, fromDate: null, toDate: null,
    signalsGenerated: 0, ordersFilled: 0, fillRate: 0,
    tp1Strategy: z('Exit at TP1'), tp2Strategy: z('Exit at TP2'), hybridStrategy: z('Hybrid (½ TP1 + runner)'),
    split: { inSample: z('In-sample'), outOfSample: z('Out-of-sample'), splitDate: null },
    monthly: [], avgPlannedRR: 0, costsApplied: false, netProfitPerContractTp1: null,
    sampleWarning: 'No trades.', maxHoldBars: maxHold, trades: [], notes, error,
  };
}

/** Run the walk-forward backtest over a series of daily candles. */
export function runBacktest(opts: {
  instrument: string;
  dataSymbol: string;
  candles: YFCandle[];
  useWeeklyFilter?: boolean;
  maxBarsInTrade?: number;
  costs?: BacktestCosts;
}): BacktestResult {
  const { instrument, dataSymbol, candles, costs } = opts;
  const useWeeklyFilter = opts.useWeeklyFilter ?? true;
  const maxHold = Math.max(1, Math.min(250, opts.maxBarsInTrade ?? MAX_BARS_IN_TRADE));

  const notes = [
    'No lookahead: every setup is built only from bars up to and including the signal bar.',
    'Fill bar: only the stop can trigger on the bar that fills the limit — targets count from the next bar (daily bars cannot show the order).',
    'A bar spanning both stop and target counts as the stop.',
    `Time-stop after ${maxHold} trading days, closed at that bar's close (marked to market).`,
    'One position at a time — the next signal waits until the open trade has fully exited.',
    'Hybrid = half off at TP1, stop to breakeven, runner to TP2.',
    costs
      ? `Costs ON: $${costs.feesRoundTrip} round-trip fees and ${costs.slippageTicks} tick(s) slippage on stop / time exits (${costs.contract}).`
      : 'Costs OFF: no commission or slippage — results are gross.',
    useWeeklyFilter
      ? 'Weekly filter ON: longs skipped when the weekly bias is down, shorts when it is up (ISO weeks, NY dates).'
      : 'Weekly filter OFF: daily bias only.',
    `In-sample = first ${Math.round(IN_SAMPLE_SHARE * 100)}% of filled trades by date, out-of-sample = the rest. Rules were not fit on either part; the split shows stability, not an optimised edge.`,
    'Session breakdown is not available: daily bars carry no intraday session.',
  ];

  if (candles.length < WARMUP + 10) {
    return emptyResult(instrument, dataSymbol, candles.length, maxHold, notes, 'Not enough history to backtest.');
  }

  const trades: BacktestTrade[] = [];
  let signalsGenerated = 0;
  let ordersFilled = 0;
  let i = WARMUP;

  while (i < candles.length - 1) {
    const slice = candles.slice(0, i + 1);
    const bias = classify(slice, K).bias;
    const action = bias === 'up' ? 'LOOK_LONG' : bias === 'down' ? 'LOOK_SHORT' : 'STAND_DOWN';
    if (action === 'STAND_DOWN') { i++; continue; }

    if (useWeeklyFilter) {
      const wk = weeklyBiasUpTo(slice);
      if (action === 'LOOK_LONG' && wk === 'down') { i++; continue; }
      if (action === 'LOOK_SHORT' && wk === 'up') { i++; continue; }
    }

    const lastPrice = slice[slice.length - 1].close;
    const levels = structureLevels(slice, bias, lastPrice, K);
    const setup = dealingRangeSetup({
      action,
      lastPrice,
      high: levels.lastSwingHigh,
      low: levels.lastSwingLow,
      equilibrium: levels.equilibrium,
      invalidation: levels.invalidation,
      zone: levels.zone,
      timeframeLabel: 'Daily',
    });

    if ((setup.status !== 'look' && setup.status !== 'wait') ||
        setup.entry == null || setup.stop == null || setup.tp1 == null || setup.tp2 == null) {
      i++; continue;
    }

    const side: TradeSide = setup.side === 'short' ? 'short' : 'long';
    const entry = setup.entry, stop = setup.stop, tp1 = setup.tp1, tp2 = setup.tp2;
    const risk = Math.abs(entry - stop);
    if (risk < 1e-9) { i++; continue; }
    signalsGenerated++;
    const plannedRR = round(Math.abs(tp1 - entry) / risk);

    let fillIdx = -1;
    for (let j = i + 1; j <= Math.min(i + MAX_BARS_TO_FILL, candles.length - 1); j++) {
      const b = candles[j];
      if (b.low <= entry && entry <= b.high) { fillIdx = j; break; }
    }

    if (fillIdx < 0) {
      trades.push({
        side, signalStatus: setup.status, signalTime: slice[slice.length - 1].time,
        fillTime: null, exitTime: null, entry, stop, tp1, tp2, risk, plannedRR,
        exitReason: 'cancelled', rToTp1Exit: null, rToTp2Exit: null, rHybridExit: null,
        holdBarsTp1: null, holdBarsTp2: null, holdBarsHybrid: null,
      });
      i++; continue;
    }

    ordersFilled++;
    const lastIdx = Math.min(fillIdx + maxHold, candles.length - 1);
    const a = singleTargetExit(candles, side, entry, stop, tp1, fillIdx, lastIdx);
    const b = singleTargetExit(candles, side, entry, stop, tp2, fillIdx, lastIdx);
    const h = hybridExit(candles, side, entry, stop, tp1, tp2, fillIdx, lastIdx);

    const net = (e: Exit) => e.r - costR(costs, risk, e.market);
    const exitReason: ExitReason =
      b.reason === 'target' ? 'tp2' : a.reason === 'target' ? 'tp1' : a.reason === 'stop' ? 'stop' : 'timeout';
    const exitIdx = Math.max(a.idx, b.idx, h.idx);

    trades.push({
      side, signalStatus: setup.status, signalTime: slice[slice.length - 1].time,
      fillTime: candles[fillIdx].time, exitTime: candles[exitIdx].time,
      entry, stop, tp1, tp2, risk, plannedRR,
      exitReason,
      rToTp1Exit: round(net(a)),
      rToTp2Exit: round(net(b)),
      rHybridExit: round(net(h)),
      holdBarsTp1: a.idx - fillIdx,
      holdBarsTp2: b.idx - fillIdx,
      holdBarsHybrid: h.idx - fillIdx,
    });

    // Flat under every exit rule before looking for the next signal.
    i = exitIdx + 1;
  }

  const filled = trades.filter((t) => t.exitReason !== 'cancelled');
  const tp1Rs = filled.map((t) => t.rToTp1Exit ?? 0);

  const splitAt = Math.floor(filled.length * IN_SAMPLE_SHARE);
  const inS = filled.slice(0, splitAt);
  const outS = filled.slice(splitAt);

  const months = new Map<string, MonthRow>();
  for (const t of filled) {
    const m = etDate(t.exitTime ?? t.fillTime ?? t.signalTime).slice(0, 7);
    const row = months.get(m) ?? { month: m, trades: 0, totalR: 0 };
    row.trades += 1;
    row.totalR = round(row.totalR + (t.rToTp1Exit ?? 0));
    months.set(m, row);
  }

  const spec = costs ? contractSpec(costs.contract) : null;
  const netProfitPerContractTp1 = spec
    ? round(filled.reduce((s, t) => s + (t.rToTp1Exit ?? 0) * t.risk * spec.pointValue, 0))
    : null;

  const sampleWarning =
    filled.length === 0
      ? 'No filled trades — nothing can be concluded.'
      : filled.length < MIN_MEANINGFUL_TRADES
      ? `Only ${filled.length} filled trades (< ${MIN_MEANINGFUL_TRADES}). Win rate and expectancy are not statistically meaningful at this sample size.`
      : null;

  return {
    instrument, dataSymbol, bars: candles.length,
    fromDate: etDate(candles[0].time),
    toDate: etDate(candles[candles.length - 1].time),
    signalsGenerated,
    ordersFilled,
    fillRate: signalsGenerated ? round((ordersFilled / signalsGenerated) * 100, 1) : 0,
    tp1Strategy: statsFor('Exit at TP1', tp1Rs, filled.map((t) => t.holdBarsTp1 ?? 0)),
    tp2Strategy: statsFor('Exit at TP2', filled.map((t) => t.rToTp2Exit ?? 0), filled.map((t) => t.holdBarsTp2 ?? 0)),
    hybridStrategy: statsFor('Hybrid (½ TP1 + runner)', filled.map((t) => t.rHybridExit ?? 0), filled.map((t) => t.holdBarsHybrid ?? 0)),
    split: {
      inSample: statsFor('In-sample (TP1 rule)', inS.map((t) => t.rToTp1Exit ?? 0)),
      outOfSample: statsFor('Out-of-sample (TP1 rule)', outS.map((t) => t.rToTp1Exit ?? 0)),
      splitDate: outS.length && outS[0].fillTime ? etDate(outS[0].fillTime) : null,
    },
    monthly: Array.from(months.values()).sort((x, y) => x.month.localeCompare(y.month)),
    avgPlannedRR: filled.length ? round(filled.reduce((s, t) => s + t.plannedRR, 0) / filled.length) : 0,
    costsApplied: Boolean(costs),
    netProfitPerContractTp1,
    sampleWarning,
    maxHoldBars: maxHold,
    trades,
    notes,
  };
}
