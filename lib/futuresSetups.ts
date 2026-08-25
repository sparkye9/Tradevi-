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

/**
 * Minimum reward-to-risk to TP1 before a dealing-range entry is a live "look".
 * With stop at the far swing and TP1 at equilibrium, R:R = 1.0 happens exactly
 * at the midpoint of the premium (or discount) half — i.e. price must be DEEP
 * in premium/discount, not one tick past equilibrium. Anything shallower is a
 * WAIT with a planned entry at that midpoint, not a live chase.
 */
const MIN_R_TO_TP1 = 1.0;

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
    const deepDiscount = (eq + low) / 2; // midpoint of the discount half → 1R to EQ
    const inDiscount = opts.zone === 'discount';

    // R:R the live "delayed last" entry would actually give to TP1 (equilibrium).
    const lookEntry = opts.lastPrice;
    const lookR = lookEntry != null ? riskReward(lookEntry, stop, eq) : null;
    const goodLook = inDiscount && lookEntry != null && lookR != null && lookR >= MIN_R_TO_TP1;

    let entry: number;
    let status: SetupStatus;
    let tp1: number;
    let tp2: number;
    let note: string;

    if (goodLook) {
      entry = lookEntry!;
      status = 'look';
      tp1 = eq;
      tp2 = high;
      note = `${tf} discount long. Price is deep in discount — entry is delayed last. Stop is last swing low. TP1 is equilibrium. TP2 is last swing high.`;
    } else if (inDiscount) {
      // In discount but too close to equilibrium — a live entry here is < 1R to TP1.
      entry = deepDiscount;
      status = 'wait';
      tp1 = eq;
      tp2 = high;
      note = `${tf} is in discount but too close to equilibrium for a clean entry (would be under 1R). Wait for a deeper pullback near ${roundPx(deepDiscount)}. Stop is last swing low. TP1 is equilibrium. TP2 is last swing high.`;
    } else {
      // Premium / equilibrium — wait for the pullback into discount.
      entry = eq;
      status = 'wait';
      tp1 = high;
      tp2 = high + range;
      note = `${tf} is not in discount yet. Planned entry is equilibrium. Stop is last swing low. TP1 is last swing high. TP2 is a measured move (range height above the high).`;
    }

    if (tp1 <= entry) tp1 = high;
    if (tp2 <= tp1) tp2 = high + range;
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
      note,
    };
  }

  const stop = opts.invalidation ?? high;
  const deepPremium = (eq + high) / 2; // midpoint of the premium half → 1R to EQ
  const inPremium = opts.zone === 'premium';

  const lookEntry = opts.lastPrice;
  const lookR = lookEntry != null ? riskReward(lookEntry, stop, eq) : null;
  const goodLook = inPremium && lookEntry != null && lookR != null && lookR >= MIN_R_TO_TP1;

  let entry: number;
  let status: SetupStatus;
  let tp1: number;
  let tp2: number;
  let note: string;

  if (goodLook) {
    entry = lookEntry!;
    status = 'look';
    tp1 = eq;
    tp2 = low;
    note = `${tf} premium short. Price is deep in premium — entry is delayed last. Stop is last swing high. TP1 is equilibrium. TP2 is last swing low.`;
  } else if (inPremium) {
    // In premium but too close to equilibrium — a live entry here is < 1R to TP1.
    entry = deepPremium;
    status = 'wait';
    tp1 = eq;
    tp2 = low;
    note = `${tf} is in premium but too close to equilibrium for a clean entry (would be under 1R). Wait for a deeper bounce near ${roundPx(deepPremium)}. Stop is last swing high. TP1 is equilibrium. TP2 is last swing low.`;
  } else {
    // Discount / equilibrium — wait for the bounce into premium.
    entry = eq;
    status = 'wait';
    tp1 = low;
    tp2 = low - range;
    note = `${tf} is not in premium yet. Planned entry is equilibrium. Stop is last swing high. TP1 is last swing low. TP2 is a measured move (range height below the low).`;
  }

  if (tp1 >= entry) tp1 = low;
  if (tp2 >= tp1) tp2 = low - range;
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
    note,
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
