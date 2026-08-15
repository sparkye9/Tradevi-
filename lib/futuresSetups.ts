/**
 * Structure-based futures trade map: entry, stop, TP1, TP2.
 *
 * Levels come from confirmed swing high / equilibrium / swing low — the same
 * dealing range as the Trend Bias Stack. This is not FVG, BOS, CHOCH, VWAP,
 * or a percent offset from last price.
 */
import type { StructureLevels, SwingAction, TrendRead, Zone } from './trendBias';

export type TradeSide = 'long' | 'short';
export type SetupStatus = 'look' | 'wait' | 'none';

export interface TradeSetup {
  side: TradeSide | null;
  status: SetupStatus;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  risk: number | null;
  rToTp1: number | null;
  note: string;
}

export interface IntradaySetupResult {
  timeframe: '15m';
  lastPrice: number | null;
  read: TrendRead;
  levels: StructureLevels;
  setup: TradeSetup;
  asOf: string;
  refreshMinutes: number;
}

function roundPx(n: number): number {
  return Math.round(n * 100) / 100;
}

function riskReward(entry: number | null, stop: number | null, target: number | null): number | null {
  if (entry == null || stop == null || target == null) return null;
  const risk = Math.abs(entry - stop);
  if (risk < 1e-9) return null;
  return Math.round(((target - entry) / (entry - stop)) * 10) / 10;
}

/**
 * Daily (or any timeframe) dealing-range map.
 *
 * LOOK + correct zone → entry at delayed last (look around here).
 * LOOK + wrong zone → planned entry at equilibrium (wait for the pullback).
 * STAND_DOWN → no numbers. We will not invent a setup from mixed structure.
 */
export function dealingRangeSetup(opts: {
  action: SwingAction;
  lastPrice: number | null;
  high: number | null;
  low: number | null;
  equilibrium: number | null;
  invalidation: number | null;
  zone: Zone;
  timeframeLabel?: string;
}): TradeSetup {
  const tf = opts.timeframeLabel ?? 'Daily';
  const empty: TradeSetup = {
    side: null,
    status: 'none',
    entry: null,
    stop: null,
    tp1: null,
    tp2: null,
    risk: null,
    rToTp1: null,
    note: `No ${tf.toLowerCase()} setup until structure agrees. Confirm on TradingView.`,
  };

  if (opts.action === 'STAND_DOWN' || opts.high == null || opts.low == null) {
    return empty;
  }

  const high = opts.high;
  const low = opts.low;
  const eq = opts.equilibrium ?? (high + low) / 2;
  const range = high - low;

  if (opts.action === 'LOOK_LONG') {
    const stop = opts.invalidation ?? low;
    const inDiscount = opts.zone === 'discount';
    const entry = inDiscount && opts.lastPrice != null ? opts.lastPrice : eq;
    const status: SetupStatus = inDiscount ? 'look' : 'wait';

    let tp1 = inDiscount ? eq : high;
    let tp2 = inDiscount ? high : high + range;

    if (entry != null && tp1 <= entry) tp1 = high;
    if (entry != null && tp2 <= tp1) tp2 = high + range;
    if (stop >= entry) {
      return {
        ...empty,
        side: 'long',
        status: 'none',
        note: `${tf} long map is inverted (stop is not below entry). Stand down — confirm swings on TradingView.`,
      };
    }

    return {
      side: 'long',
      status,
      entry: roundPx(entry),
      stop: roundPx(stop),
      tp1: roundPx(tp1),
      tp2: roundPx(tp2),
      risk: roundPx(Math.abs(entry - stop)),
      rToTp1: riskReward(entry, stop, tp1),
      note: inDiscount
        ? `${tf} discount long. Entry is delayed last. Stop is last swing low. TP1 is equilibrium. TP2 is last swing high.`
        : `${tf} is not in discount yet. Planned entry is equilibrium. Stop is last swing low. TP1 is last swing high. TP2 is a measured move (range height above the high).`,
    };
  }

  const stop = opts.invalidation ?? high;
  const inPremium = opts.zone === 'premium';
  const entry = inPremium && opts.lastPrice != null ? opts.lastPrice : eq;
  const status: SetupStatus = inPremium ? 'look' : 'wait';

  let tp1 = inPremium ? eq : low;
  let tp2 = inPremium ? low : low - range;

  if (entry != null && tp1 >= entry) tp1 = low;
  if (entry != null && tp2 >= tp1) tp2 = low - range;
  if (stop <= entry) {
    return {
      ...empty,
      side: 'short',
      status: 'none',
      note: `${tf} short map is inverted (stop is not above entry). Stand down — confirm swings on TradingView.`,
    };
  }

  return {
    side: 'short',
    status,
    entry: roundPx(entry),
    stop: roundPx(stop),
    tp1: roundPx(tp1),
    tp2: roundPx(tp2),
    risk: roundPx(Math.abs(entry - stop)),
    rToTp1: riskReward(entry, stop, tp1),
    note: inPremium
      ? `${tf} premium short. Entry is delayed last. Stop is last swing high. TP1 is equilibrium. TP2 is last swing low.`
      : `${tf} is not in premium yet. Planned entry is equilibrium. Stop is last swing high. TP1 is last swing low. TP2 is a measured move (range height below the low).`,
  };
}

/** 15-minute bias → same LOOK / wait / stand-down language as the swing stack. */
export function intradayAction(read: TrendRead): SwingAction {
  if (read.bias === 'up') return 'LOOK_LONG';
  if (read.bias === 'down') return 'LOOK_SHORT';
  return 'STAND_DOWN';
}

export function swingSetupFromDaily(
  action: SwingAction,
  daily: StructureLevels,
  lastPrice: number | null,
): TradeSetup {
  return dealingRangeSetup({
    action,
    lastPrice,
    high: daily.lastSwingHigh,
    low: daily.lastSwingLow,
    equilibrium: daily.equilibrium,
    invalidation: daily.invalidation,
    zone: daily.zone,
    timeframeLabel: 'Daily',
  });
}

export function intradaySetupFromLevels(
  read: TrendRead,
  levels: StructureLevels,
  lastPrice: number | null,
): TradeSetup {
  return dealingRangeSetup({
    action: intradayAction(read),
    lastPrice,
    high: levels.lastSwingHigh,
    low: levels.lastSwingLow,
    equilibrium: levels.equilibrium,
    invalidation: levels.invalidation,
    zone: levels.zone,
    timeframeLabel: '15m',
  });
}
