/**
 * Historical backtest harness for the daily dealing-range swing engine.
 *
 * Walks daily candles forward bar-by-bar with NO lookahead: at each bar close it
 * builds the exact same structure read (classify + structureLevels) and setup
 * (dealingRangeSetup) the live app would show, places the resulting entry as a
 * limit order, then simulates the fill and exit against the bars that follow.
 *
 * Honest scope:
 *  - This tests the DAILY dealing-range mechanics — entry / stop / TP / the new
 *    R:R gate — which is the logic that was changed. The live app additionally
 *    gates on a Weekly / Daily / 4H stack; here we apply a lighter Weekly filter
 *    (don't fight the weekly bias) because Yahoo only serves ~10 days of intraday
 *    history, so a faithful 4H replay isn't possible. Live signal frequency will
 *    therefore be more selective than the raw daily numbers below.
 *  - Within a single bar that spans both stop and target, we assume the STOP is
 *    hit first (conservative). No slippage, no commission, no partial fills.
 */
import type { YFCandle } from './yahooChart';
import { classify, structureLevels, type Bias } from './trendBias';
import { dealingRangeSetup, type TradeSide } from './futuresSetups';

const K = 2;                 // swing strictness — matches SWING_STRICTNESS in trendBias
const WARMUP = 40;           // bars needed before the structure read is meaningful
const MAX_BARS_TO_FILL = 10; // cancel a resting limit if unfilled after N bars
const MAX_BARS_IN_TRADE = 40;// time-stop an open trade after N bars

export type ExitReason = 'tp1' | 'tp2' | 'stop' | 'timeout' | 'cancelled';

export interface BacktestTrade {
  side: TradeSide;
  signalStatus: 'look' | 'wait';
  signalTime: number;
  fillTime: number | null;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  risk: number;
  exitReason: ExitReason;
  rToTp1Exit: number | null;   // R multiple under a "exit all at TP1" rule
  rToTp2Exit: number | null;   // R multiple under a "exit all at TP2" rule
}

export interface StrategyStats {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;         // 0–100
  expectancyR: number;     // average R per trade
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
  avgWinR: number;
  avgLossR: number;
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
  trades: BacktestTrade[];
  notes: string[];
  error?: string;
}

function weeklyBiasUpTo(daily: YFCandle[]): Bias {
  // Resample the daily slice into weekly buckets (7-day) and classify.
  const bucket = 7 * 86400;
  const map = new Map<number, YFCandle[]>();
  for (const c of daily) {
    const key = Math.floor(c.time / bucket) * bucket;
    const g = map.get(key);
    if (g) g.push(c);
    else map.set(key, [c]);
  }
  const weekly = Array.from(map.keys()).sort((a, b) => a - b).map((k) => {
    const g = map.get(k)!;
    return {
      time: k,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
  return classify(weekly, K).bias;
}

function statsFor(label: string, rs: number[]): StrategyStats {
  const trades = rs.length;
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const totalR = rs.reduce((s, r) => s + r, 0);
  const grossWin = wins.reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));

  // Max drawdown of the running R equity curve.
  let peak = 0, equity = 0, maxDd = 0;
  for (const r of rs) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    label,
    trades,
    wins: wins.length,
    losses: losses.length,
    winRate: trades ? Math.round((wins.length / trades) * 1000) / 10 : 0,
    expectancyR: trades ? Math.round((totalR / trades) * 100) / 100 : 0,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0),
    totalR: Math.round(totalR * 10) / 10,
    maxDrawdownR: Math.round(maxDd * 10) / 10,
    avgWinR: wins.length ? Math.round((grossWin / wins.length) * 100) / 100 : 0,
    avgLossR: losses.length ? Math.round((grossLoss / losses.length) * 100) / 100 : 0,
  };
}

/** Run the walk-forward backtest over a series of daily candles. */
export function runBacktest(opts: {
  instrument: string;
  dataSymbol: string;
  candles: YFCandle[];
  useWeeklyFilter?: boolean;
}): BacktestResult {
  const { instrument, dataSymbol, candles } = opts;
  const useWeeklyFilter = opts.useWeeklyFilter ?? true;

  const notes = [
    'No lookahead: every setup is built only from bars up to and including the signal bar.',
    'Conservative fills: a bar spanning both stop and target counts as a stop.',
    'No slippage or commission. Futures points converted to R multiples (R = entry→stop distance).',
    useWeeklyFilter
      ? 'Weekly filter ON: longs skipped when the weekly bias is down, shorts when it is up.'
      : 'Weekly filter OFF: daily bias only.',
  ];

  if (candles.length < WARMUP + 10) {
    return {
      instrument, dataSymbol, bars: candles.length,
      fromDate: null, toDate: null,
      signalsGenerated: 0, ordersFilled: 0, fillRate: 0,
      tp1Strategy: statsFor('Exit at TP1', []),
      tp2Strategy: statsFor('Exit at TP2', []),
      trades: [], notes,
      error: 'Not enough history to backtest.',
    };
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

    signalsGenerated++;
    const side: TradeSide = setup.side === 'short' ? 'short' : 'long';
    const entry = setup.entry, stop = setup.stop, tp1 = setup.tp1, tp2 = setup.tp2;
    const risk = Math.abs(entry - stop);
    if (risk < 1e-9) { i++; continue; }

    // Resolve the resting limit + trade against subsequent bars.
    let filled = false, fillIdx = -1;
    for (let j = i + 1; j <= Math.min(i + MAX_BARS_TO_FILL, candles.length - 1); j++) {
      const b = candles[j];
      if (b.low <= entry && entry <= b.high) { filled = true; fillIdx = j; break; }
    }

    if (!filled) {
      trades.push({
        side, signalStatus: setup.status, signalTime: slice[slice.length - 1].time,
        fillTime: null, entry, stop, tp1, tp2, risk,
        exitReason: 'cancelled', rToTp1Exit: null, rToTp2Exit: null,
      });
      i++; continue;
    }

    ordersFilled++;
    // Manage the position from the fill bar forward.
    let exitReason: ExitReason = 'timeout';
    let hitTp1 = false, hitTp2 = false, hitStop = false;
    for (let j = fillIdx; j <= Math.min(fillIdx + MAX_BARS_IN_TRADE, candles.length - 1); j++) {
      const b = candles[j];
      const stopHit = side === 'long' ? b.low <= stop : b.high >= stop;
      const tp1Hit = side === 'long' ? b.high >= tp1 : b.low <= tp1;
      const tp2Hit = side === 'long' ? b.high >= tp2 : b.low <= tp2;
      if (stopHit) { hitStop = true; break; }      // conservative: stop before target in same bar
      if (tp2Hit) { hitTp2 = true; hitTp1 = true; break; }
      if (tp1Hit) { hitTp1 = true; /* keep running toward tp2 */ }
    }

    const rTp1 = Math.abs(tp1 - entry) / risk;
    const rTp2 = Math.abs(tp2 - entry) / risk;

    // Strategy A — exit everything at TP1.
    let rToTp1Exit: number;
    if (hitStop && !hitTp1) rToTp1Exit = -1;
    else if (hitTp1) rToTp1Exit = rTp1;
    else rToTp1Exit = 0; // timeout flat-ish (no target, no stop)

    // Strategy B — exit everything at TP2 (ignore TP1).
    let rToTp2Exit: number;
    if (hitStop && !hitTp2) rToTp2Exit = -1;
    else if (hitTp2) rToTp2Exit = rTp2;
    else rToTp2Exit = 0;

    if (hitStop) exitReason = 'stop';
    else if (hitTp2) exitReason = 'tp2';
    else if (hitTp1) exitReason = 'tp1';
    else exitReason = 'timeout';

    trades.push({
      side, signalStatus: setup.status, signalTime: slice[slice.length - 1].time,
      fillTime: candles[fillIdx].time, entry, stop, tp1, tp2, risk,
      exitReason,
      rToTp1Exit: Math.round(rToTp1Exit * 100) / 100,
      rToTp2Exit: Math.round(rToTp2Exit * 100) / 100,
    });

    // Jump past the trade so we don't overlap positions.
    i = fillIdx + 1;
  }

  const filledTrades = trades.filter((t) => t.exitReason !== 'cancelled');
  const tp1Rs = filledTrades.map((t) => t.rToTp1Exit ?? 0);
  const tp2Rs = filledTrades.map((t) => t.rToTp2Exit ?? 0);

  return {
    instrument, dataSymbol, bars: candles.length,
    fromDate: candles.length ? new Date(candles[0].time * 1000).toISOString().slice(0, 10) : null,
    toDate: candles.length ? new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10) : null,
    signalsGenerated,
    ordersFilled,
    fillRate: signalsGenerated ? Math.round((ordersFilled / signalsGenerated) * 1000) / 10 : 0,
    tp1Strategy: statsFor('Exit at TP1', tp1Rs),
    tp2Strategy: statsFor('Exit at TP2', tp2Rs),
    trades,
    notes,
  };
}
