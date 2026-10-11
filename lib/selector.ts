/**
 * Market Selector: rank futures by higher-timeframe cleanliness and the
 * nearest untaken liquidity draw. Pure functions over daily candles — no
 * fetching here (see lib/selectorData.ts).
 *
 * Daily view (default): metrics on daily bars, draws = prior week / prior
 * month high-low plus daily equal highs/lows.
 * Weekly view: the same metrics on weekly bars resampled from the dailies,
 * draws = prior month high/low plus weekly equal highs/lows.
 */
import {
  atr,
  atrSeries,
  adx as adxOf,
  efficiencyRatio,
  emaSeries,
  etDate,
  fractalPivots,
  isoWeekKey,
  monthKey,
  resampleMonthly,
  resampleWeekly,
  round,
  type Candle,
  type ResampledBar,
} from './indicators';
import { fmtPrice } from './formatters';

export type SelectorLabel = 'Trade' | 'Watch' | 'Avoid';
export type SelectorBias = 'Bullish' | 'Bearish' | 'Neutral';
export type SelectorTimeframe = 'daily' | 'weekly';

export type DrawType =
  | 'prior_week_high'
  | 'prior_week_low'
  | 'prior_month_high'
  | 'prior_month_low'
  | 'equal_highs'
  | 'equal_lows';

export interface Draw {
  type: DrawType;
  price: number;
  distance_atr: number;
  side: 'above' | 'below';
}

export interface SelectorScore {
  er: number;
  adx: number;
  reachability: number;
  bias: number;
  not_inside: number;
}

export interface SelectorItem {
  symbol: string;
  display: string;
  trade_as: string;
  label: SelectorLabel;
  score: number;
  bias: SelectorBias;
  target_draw: Draw | null;
  /** For a Neutral bias: the nearest draw on the other side. */
  alt_draw: Draw | null;
  er10: number;
  adx14: number;
  atr14: number;
  inside_day: boolean;
  roll_gap_flag: boolean;
  reasons: string[];
  updated_at: string;
  /** Extra detail (not part of the spec contract). */
  last_close: number;
  last_bar_date: string;
  components: SelectorScore;
  draws: Draw[];
  timeframe: SelectorTimeframe;
}

export const SELECTOR_WEIGHTS = { er: 30, adx: 20, reachability: 25, bias: 15, not_inside: 10 } as const;
export const SELECTOR_THRESHOLDS = {
  erClean: 0.4,
  erChop: 0.25,
  adxTrend: 25,
  adxChop: 18,
  trade: 65,
  watch: 45,
  equalLevelAtr: 0.1,
  equalLookback: 40,
  rollGapAtr: 3,
  rollLookback: 15,
} as const;

// ─── helpers ────────────────────────────────────────────────────────────────

function lerp01(x: number, lo: number, hi: number): number {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return (x - lo) / (hi - lo);
}

/** Reachability: 0 at 0 ATR, full between 0.5 and 2.0, back to 0 at 4.0 ATR. */
export function reachability(distanceAtr: number | null): number {
  if (distanceAtr == null || distanceAtr <= 0) return 0;
  if (distanceAtr < 0.5) return distanceAtr / 0.5;
  if (distanceAtr <= 2) return 1;
  if (distanceAtr >= 4) return 0;
  return (4 - distanceAtr) / 2;
}

function etWeekday(now: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
}

/** Weekly buckets whose trading week is over as of `now` (Monday-keyed). */
export function completedWeeks(weekly: ResampledBar[], now: Date): ResampledBar[] {
  const nowKey = isoWeekKey(etDate(Math.floor(now.getTime() / 1000)));
  const wd = etWeekday(now);
  const weekendNow = wd === 'Sat' || wd === 'Sun';
  return weekly.filter((w) => w.key < nowKey || (w.key === nowKey && weekendNow));
}

export function completedMonths(monthly: ResampledBar[], now: Date): ResampledBar[] {
  const nowKey = monthKey(etDate(Math.floor(now.getTime() / 1000)));
  return monthly.filter((m) => m.key < nowKey);
}

/**
 * Daily bars whose session is over. Yahoo dates the in-progress Globex session
 * by its US trading date, so before the 5:00 PM ET close the newest bar is a
 * partial overnight bar; it is dropped so inside-day, ER and ADX run on
 * finished sessions only.
 */
export function completedDaily(daily: Candle[], now: Date): Candle[] {
  if (daily.length === 0) return daily;
  const nowSec = Math.floor(now.getTime() / 1000);
  const today = etDate(nowSec);
  const hourEt = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  const last = daily[daily.length - 1];
  if (etDate(last.time) === today && hourEt < 17) return daily.slice(0, -1);
  return daily;
}

/** Price traded through the level after `fromIndex` (exclusive) on the given bars. */
export function takenAfter(bars: Candle[], fromIndex: number, level: number, side: 'above' | 'below'): boolean {
  for (let i = fromIndex + 1; i < bars.length; i++) {
    if (side === 'above' && bars[i].high > level) return true;
    if (side === 'below' && bars[i].low < level) return true;
  }
  return false;
}

/** Index of the last bar that belongs to a bucket (by its key function). */
function lastIndexOfBucket(bars: Candle[], key: string, keyOf: (ymd: string) => string): number {
  let idx = -1;
  for (let i = 0; i < bars.length; i++) if (keyOf(etDate(bars[i].time)) === key) idx = i;
  return idx;
}

/**
 * Equal highs / lows: fractal pivots (2 left, 2 right) in the last `lookback`
 * bars whose prices sit within `tolerance` of each other. The level is the
 * extreme of the pair (where the stops actually rest). Returned only if
 * untaken since the later pivot.
 */
export function equalLevels(
  bars: Candle[],
  tolerance: number,
  lookback: number,
): { highs: { price: number; formedAt: number }[]; lows: { price: number; formedAt: number }[] } {
  const start = Math.max(0, bars.length - lookback);
  const window = bars.slice(start);
  const { highs, lows } = fractalPivots(window, 2, 2);
  const out = { highs: [] as { price: number; formedAt: number }[], lows: [] as { price: number; formedAt: number }[] };

  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) <= tolerance) {
        const price = Math.max(highs[i].price, highs[j].price);
        const formedAt = start + highs[j].index;
        if (!takenAfter(bars, formedAt, price, 'above') && !out.highs.some((h) => Math.abs(h.price - price) <= tolerance)) {
          out.highs.push({ price, formedAt });
        }
      }
    }
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) <= tolerance) {
        const price = Math.min(lows[i].price, lows[j].price);
        const formedAt = start + lows[j].index;
        if (!takenAfter(bars, formedAt, price, 'below') && !out.lows.some((l) => Math.abs(l.price - price) <= tolerance)) {
          out.lows.push({ price, formedAt });
        }
      }
    }
  }
  return out;
}

/** Roll-gap artefact: a daily gap > N × ATR14 inside a known roll window within the lookback. */
export function rollGapFlag(daily: Candle[], inRollWindow: (ymd: string) => boolean, lookback = SELECTOR_THRESHOLDS.rollLookback): boolean {
  const atrs = atrSeries(daily, 14);
  for (let i = Math.max(1, daily.length - lookback); i < daily.length; i++) {
    const a = atrs[i - 1];
    if (a == null || a <= 0) continue;
    const gap = Math.abs(daily[i].open - daily[i - 1].close);
    if (gap > SELECTOR_THRESHOLDS.rollGapAtr * a && inRollWindow(etDate(daily[i].time))) return true;
  }
  return false;
}

export function htfBias(daily: Candle[], weeklyDone: ResampledBar[]): SelectorBias {
  if (weeklyDone.length < 2 || daily.length < 20) return 'Neutral';
  const lastW = weeklyDone[weeklyDone.length - 1];
  const prevW = weeklyDone[weeklyDone.length - 2];
  const prevMid = (prevW.high + prevW.low) / 2;
  const ema20 = emaSeries(daily.map((c) => c.close), 20);
  const e = ema20[ema20.length - 1];
  const close = daily[daily.length - 1].close;
  if (e == null) return 'Neutral';
  if (lastW.close > prevMid && close > e) return 'Bullish';
  if (lastW.close < prevMid && close < e) return 'Bearish';
  return 'Neutral';
}

export function labelFor(score: number): SelectorLabel {
  if (score >= SELECTOR_THRESHOLDS.trade) return 'Trade';
  if (score >= SELECTOR_THRESHOLDS.watch) return 'Watch';
  return 'Avoid';
}

export const DRAW_NAMES: Record<DrawType, string> = {
  prior_week_high: 'prior week high',
  prior_week_low: 'prior week low',
  prior_month_high: 'prior month high',
  prior_month_low: 'prior month low',
  equal_highs: 'equal highs',
  equal_lows: 'equal lows',
};

const fmtPx = fmtPrice;

// ─── main ───────────────────────────────────────────────────────────────────

export interface SelectorInput {
  symbol: string;
  display: string;
  tradeAs: string;
  /** Daily bars, oldest → newest (2 years recommended). */
  daily: Candle[];
  now: Date;
  timeframe?: SelectorTimeframe;
  inRollWindow?: (ymd: string) => boolean;
}

export function computeSelector(input: SelectorInput): SelectorItem {
  const timeframe = input.timeframe ?? 'daily';
  const now = input.now;
  const daily = completedDaily(input.daily, now);
  if (daily.length < 60) throw new Error(`${input.symbol}: need at least 60 completed daily bars, got ${daily.length}`);
  const weekly = resampleWeekly(daily);
  const monthly = resampleMonthly(daily);
  const weeklyDone = completedWeeks(weekly, now);
  const monthlyDone = completedMonths(monthly, now);

  // Bars the metrics run on.
  const bars: Candle[] = timeframe === 'daily' ? daily : weeklyDone;
  if (bars.length < 30) throw new Error(`${input.symbol}: not enough ${timeframe} bars (${bars.length})`);
  const lastClose = daily[daily.length - 1].close;
  const atr14 = atr(bars, 14);
  if (atr14 == null || atr14 <= 0) throw new Error(`${input.symbol}: ATR unavailable`);
  const er10 = efficiencyRatio(bars.map((c) => c.close), 10) ?? 0;
  const adx14 = adxOf(bars, 14) ?? 0;
  const bias = htfBias(daily, weeklyDone);

  // Inside bar: last bar inside the previous bar's range (day on daily, week on weekly).
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const inside = last.high <= prev.high && last.low >= prev.low;

  // ── Draws (untaken only) ──
  const draws: Draw[] = [];
  const addDraw = (type: DrawType, price: number) => {
    if (!Number.isFinite(price) || price === lastClose) return;
    const side: 'above' | 'below' = price > lastClose ? 'above' : 'below';
    // A high below price or a low above price has already been traded through.
    if (type.endsWith('high') || type === 'equal_highs') {
      if (side !== 'above') return;
    } else if (side !== 'below') return;
    draws.push({ type, price, distance_atr: Math.abs(price - lastClose) / atr14, side });
  };

  if (timeframe === 'daily' && weeklyDone.length) {
    const pw = weeklyDone[weeklyDone.length - 1];
    const endIdx = lastIndexOfBucket(daily, pw.key, isoWeekKey);
    if (!takenAfter(daily, endIdx, pw.high, 'above')) addDraw('prior_week_high', pw.high);
    if (!takenAfter(daily, endIdx, pw.low, 'below')) addDraw('prior_week_low', pw.low);
  }
  if (monthlyDone.length) {
    const pm = monthlyDone[monthlyDone.length - 1];
    const endIdx = lastIndexOfBucket(daily, pm.key, monthKey);
    if (!takenAfter(daily, endIdx, pm.high, 'above')) addDraw('prior_month_high', pm.high);
    if (!takenAfter(daily, endIdx, pm.low, 'below')) addDraw('prior_month_low', pm.low);
  }
  const eq = equalLevels(bars, SELECTOR_THRESHOLDS.equalLevelAtr * atr14, SELECTOR_THRESHOLDS.equalLookback);
  // On the weekly view `bars` are completed weeks, so also check the current
  // (incomplete) week's daily bars: a level swept on Tuesday is already taken.
  const sweptOnDaily = (formedAt: number, price: number, side: 'above' | 'below'): boolean => {
    if (timeframe !== 'weekly') return false;
    const week = weeklyDone[formedAt];
    if (!week) return false;
    return takenAfter(daily, lastIndexOfBucket(daily, week.key, isoWeekKey), price, side);
  };
  for (const h of eq.highs) if (!sweptOnDaily(h.formedAt, h.price, 'above')) addDraw('equal_highs', h.price);
  for (const l of eq.lows) if (!sweptOnDaily(l.formedAt, l.price, 'below')) addDraw('equal_lows', l.price);
  draws.sort((a, b) => a.distance_atr - b.distance_atr);

  const above = draws.filter((d) => d.side === 'above');
  const below = draws.filter((d) => d.side === 'below');
  let target: Draw | null = null;
  let alt: Draw | null = null;
  if (bias === 'Bullish') target = above[0] ?? null;
  else if (bias === 'Bearish') target = below[0] ?? null;
  else {
    const nearest = draws[0] ?? null;
    target = nearest;
    alt = nearest ? (nearest.side === 'above' ? below[0] ?? null : above[0] ?? null) : null;
  }

  // ── Score ──
  const comps: SelectorScore = {
    er: Math.round(SELECTOR_WEIGHTS.er * lerp01(er10, SELECTOR_THRESHOLDS.erChop, SELECTOR_THRESHOLDS.erClean)),
    adx: Math.round(SELECTOR_WEIGHTS.adx * lerp01(adx14, SELECTOR_THRESHOLDS.adxChop, SELECTOR_THRESHOLDS.adxTrend)),
    reachability: Math.round(SELECTOR_WEIGHTS.reachability * reachability(target?.distance_atr ?? null)),
    bias: bias === 'Neutral' ? 0 : SELECTOR_WEIGHTS.bias,
    not_inside: inside ? 0 : SELECTOR_WEIGHTS.not_inside,
  };
  const score = Math.max(0, Math.min(100, comps.er + comps.adx + comps.reachability + comps.bias + comps.not_inside));
  // Guard: a path this noisy is not "clean" whatever the other components say.
  // ER below the chop threshold caps the label at Watch (score is unchanged).
  const erChop = er10 < SELECTOR_THRESHOLDS.erChop;
  const rawLabel = labelFor(score);
  const label: SelectorLabel = erChop && rawLabel === 'Trade' ? 'Watch' : rawLabel;
  const roll = rollGapFlag(daily, input.inRollWindow ?? (() => false));

  // ── Reasons ──
  const reasons: string[] = [];
  const erTxt = er10.toFixed(2);
  const adxTxt = Math.round(adx14).toString();
  const clean = er10 >= SELECTOR_THRESHOLDS.erClean && adx14 >= SELECTOR_THRESHOLDS.adxTrend;
  const chop = erChop && adx14 < SELECTOR_THRESHOLDS.adxChop;
  reasons.push(
    clean
      ? `Clean trend (ER ${erTxt}, ADX ${adxTxt}).`
      : chop
      ? `Choppy (ER ${erTxt}, ADX ${adxTxt}).`
      : erChop
      ? `Inefficient path (ER ${erTxt}) even with ADX ${adxTxt} — grinding, not clean.`
      : `Mixed tape (ER ${erTxt}, ADX ${adxTxt}).`,
  );
  if (erChop && rawLabel === 'Trade') reasons.push('Capped at Watch: ER below 0.25.');
  const unit = timeframe === 'weekly' ? 'weekly ATR' : 'ATR';
  if (bias !== 'Neutral') {
    reasons.push(
      target
        ? `${bias}. Draw: ${DRAW_NAMES[target.type]} ${fmtPx(target.price)}, ${target.distance_atr.toFixed(1)} ${unit} away.`
        : `${bias}, but no untaken draw ${bias === 'Bullish' ? 'above' : 'below'} price.`,
    );
  } else {
    const parts = [target, alt].filter((d): d is Draw => Boolean(d)).map((d) => `${DRAW_NAMES[d.type]} ${fmtPx(d.price)} ${d.distance_atr.toFixed(1)} ${unit} ${d.side}`);
    reasons.push(parts.length ? `Neutral bias. Nearest draws: ${parts.join('; ')}.` : 'Neutral bias and no untaken draw nearby.');
  }
  if (target && target.distance_atr > 2) reasons.push(`Draw is far (${target.distance_atr.toFixed(1)} ${unit}); partial reachability credit.`);
  if (target && target.distance_atr < 0.5) reasons.push(`Draw is very close (${target.distance_atr.toFixed(1)} ${unit}); little room to it.`);
  if (inside) reasons.push(timeframe === 'weekly' ? "Inside last week's range." : "Inside yesterday's range.");
  if (roll) reasons.push('Contract-roll gap in the last 15 sessions — ER / ADX may be distorted.');
  if (label === 'Avoid') reasons.push('Avoid.');

  return {
    symbol: input.symbol,
    display: input.display,
    trade_as: input.tradeAs,
    label,
    score,
    bias,
    target_draw: target ? { ...target, price: round(target.price, 4)!, distance_atr: round(target.distance_atr, 2)! } : null,
    alt_draw: alt ? { ...alt, price: round(alt.price, 4)!, distance_atr: round(alt.distance_atr, 2)! } : null,
    er10: round(er10, 3)!,
    adx14: round(adx14, 1)!,
    atr14: round(atr14, 4)!,
    inside_day: inside,
    roll_gap_flag: roll,
    reasons,
    updated_at: now.toISOString(),
    last_close: round(lastClose, 4)!,
    last_bar_date: etDate(daily[daily.length - 1].time),
    components: comps,
    draws: draws.map((d) => ({ ...d, price: round(d.price, 4)!, distance_atr: round(d.distance_atr, 2)! })),
    timeframe,
  };
}

/** Rank: score desc, then ER desc, then symbol. */
export function rankSelector(items: SelectorItem[]): SelectorItem[] {
  return [...items].sort((a, b) => b.score - a.score || b.er10 - a.er10 || a.symbol.localeCompare(b.symbol));
}
