/**
 * Shared, dependency-free indicator math for the futures readiness engine and
 * the Market Selector. Everything here is a pure function over OHLC candles.
 *
 * Conventions: arrays are oldest → newest. Series outputs are aligned to the
 * input index; entries before the warm-up are null.
 */
import type { YFCandle } from './yahooChart';

export type Candle = Pick<YFCandle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>;

/** True range per bar (first bar = high − low). */
export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
}

/** Wilder smoothing (RMA): seed with the simple mean of the first `period` values. */
export function wilderSmooth(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Wilder ATR series. */
export function atrSeries(candles: Candle[], period = 14): (number | null)[] {
  return wilderSmooth(trueRange(candles), period);
}

/** Latest Wilder ATR, or null when there is not enough history. */
export function atr(candles: Candle[], period = 14): number | null {
  const s = atrSeries(candles, period);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
  return null;
}

/** Exponential moving average series (SMA seed). */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

/**
 * Kaufman efficiency ratio over the last `period` bars:
 * |close[t] − close[t−period]| / Σ|close[i] − close[i−1]|.
 * 1.0 = perfectly straight line, 0 = pure noise.
 */
export function efficiencyRatio(closes: number[], period = 10): number | null {
  if (closes.length < period + 1) return null;
  const end = closes.length - 1;
  const net = Math.abs(closes[end] - closes[end - period]);
  let path = 0;
  for (let i = end - period + 1; i <= end; i++) path += Math.abs(closes[i] - closes[i - 1]);
  if (path === 0) return 0;
  return net / path;
}

export interface DmiResult {
  diPlus: (number | null)[];
  diMinus: (number | null)[];
  dx: (number | null)[];
  adx: (number | null)[];
}

/**
 * Wilder DMI / ADX. +DM, −DM and TR are Wilder-smoothed over `period`, DX is
 * derived, and ADX is the Wilder smoothing of DX over another `period` bars.
 */
export function dmi(candles: Candle[], period = 14): DmiResult {
  const n = candles.length;
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const tr = trueRange(candles);
  // Wilder's original uses a running sum (×period) but the ratio is identical
  // with RMA on both numerator and denominator.
  const sTR = wilderSmooth(tr.slice(1), period);
  const sPlus = wilderSmooth(plusDM.slice(1), period);
  const sMinus = wilderSmooth(minusDM.slice(1), period);

  const diPlus: (number | null)[] = new Array(n).fill(null);
  const diMinus: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);
  const dxValues: number[] = [];
  const dxIndex: number[] = [];
  for (let i = 1; i < n; i++) {
    const t = sTR[i - 1];
    const p = sPlus[i - 1];
    const m = sMinus[i - 1];
    if (t == null || p == null || m == null) continue;
    const dp = t > 0 ? (100 * p) / t : 0;
    const dm = t > 0 ? (100 * m) / t : 0;
    diPlus[i] = dp;
    diMinus[i] = dm;
    const sum = dp + dm;
    const d = sum > 0 ? (100 * Math.abs(dp - dm)) / sum : 0;
    dx[i] = d;
    dxValues.push(d);
    dxIndex.push(i);
  }
  const adx: (number | null)[] = new Array(n).fill(null);
  const sDx = wilderSmooth(dxValues, period);
  for (let j = 0; j < dxValues.length; j++) {
    if (sDx[j] != null) adx[dxIndex[j]] = sDx[j];
  }
  return { diPlus, diMinus, dx, adx };
}

/** Latest ADX value, or null. */
export function adx(candles: Candle[], period = 14): number | null {
  const { adx: s } = dmi(candles, period);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
  return null;
}

export interface Pivot {
  index: number;
  price: number;
}

/**
 * Fractal swing highs / lows: a bar whose high (low) is the strict max (min)
 * of `left` bars before and `right` bars after. Only confirmed pivots are
 * returned, so the last `right` bars can never be a pivot (no lookahead).
 */
export function fractalPivots(candles: Candle[], left = 2, right = 2): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right && (isHigh || isLow); j++) {
      if (j === i) continue;
      if (candles[j].high >= h) isHigh = false;
      if (candles[j].low <= l) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: h });
    if (isLow) lows.push({ index: i, price: l });
  }
  return { highs, lows };
}

// ─── Resampling ─────────────────────────────────────────────────────────────

const ET = 'America/New_York';

/** YYYY-MM-DD of a unix-second timestamp in New York time. */
export function etDate(unixSeconds: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(unixSeconds * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Days since 1970-01-01 for a YYYY-MM-DD string (UTC arithmetic on the calendar date). */
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** ISO-week key (Monday-start) for a YYYY-MM-DD string, e.g. "2026-W41". */
export function isoWeekKey(ymd: string): string {
  const dn = dayNumber(ymd);
  // 1970-01-01 was a Thursday → Monday-start week index.
  const monday = dn - ((dn + 3) % 7);
  const mondayDate = new Date(monday * 86400000);
  return `${mondayDate.getUTCFullYear()}-${String(mondayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    mondayDate.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

export interface ResampledBar extends Candle {
  /** Bucket key (Monday date for weeks, YYYY-MM for months). */
  key: string;
  /** Number of source bars folded into this bucket. */
  bars: number;
}

function resampleBy(candles: Candle[], keyOf: (ymd: string) => string): ResampledBar[] {
  const out: ResampledBar[] = [];
  let cur: ResampledBar | null = null;
  for (const c of candles) {
    const key = keyOf(etDate(c.time));
    if (!cur || cur.key !== key) {
      cur = { key, time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, bars: 1 };
      out.push(cur);
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
      cur.bars += 1;
    }
  }
  return out;
}

/** Weekly bars (Monday-start ISO weeks, New York dates) built from daily bars. */
export function resampleWeekly(daily: Candle[]): ResampledBar[] {
  return resampleBy(daily, isoWeekKey);
}

/** Calendar-month bars built from daily bars. */
export function resampleMonthly(daily: Candle[]): ResampledBar[] {
  return resampleBy(daily, monthKey);
}

/** Round helper for API output. */
export function round(n: number | null, places = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
