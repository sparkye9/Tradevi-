/**
 * Dated series used by every Crash Intelligence engine.
 *
 * Every point carries the date it describes AND the date it became known
 * (`availableOn`). The engines only ever see points through `pointInTime()`,
 * which drops anything not yet published on the as-of date, so the live
 * dashboard and the historical replay share one look-ahead guard.
 */

export type SeriesKind = 'bars' | 'level';

export interface Bar {
  /** Trading date, YYYY-MM-DD (US/Eastern session date). */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LevelPoint {
  /** Observation date the value describes, YYYY-MM-DD. */
  date: string;
  value: number;
  /** First date a trader could have seen this value (YYYY-MM-DD). Defaults to `date`. */
  availableOn?: string;
}

export interface SeriesMeta {
  id: string;
  label: string;
  /** Human source label, e.g. "FRED (ICE BofA)" or "Yahoo (delayed)". */
  source: string;
  /** Unit shown next to values: '%', 'pts', '$', 'index', 'ratio'. */
  unit: string;
  /** How fresh this series is, in plain words. */
  freshness: string;
  /** True when values can be revised after first release and no vintage data was used. */
  revisable?: boolean;
  /** True when vintages (first-release values) were used, making history strict point-in-time. */
  vintage?: boolean;
  license?: string;
  /** ISO time the data was fetched. */
  fetchedAt?: string;
}

export interface BarSeries {
  kind: 'bars';
  meta: SeriesMeta;
  /** Oldest first. A bar is available after that date's close. */
  bars: Bar[];
}

export interface LevelSeries {
  kind: 'level';
  meta: SeriesMeta;
  /** Oldest first. */
  points: LevelPoint[];
}

export type AnySeries = BarSeries | LevelSeries;

export interface DataError {
  id: string;
  error: string;
}

/** Everything an engine may read for one as-of date. */
export interface MarketDataset {
  series: Record<string, AnySeries>;
  errors: DataError[];
}

/**
 * When an as-of date's information set is cut.
 *  - 'close': after that day's 4:00 PM close — that day's bar is included.
 *  - 'open': before that day's open — only bars through the prior session.
 */
export type CutMode = 'close' | 'open';

/** Binary search: index of the last element with key ≤ target, or -1. */
export function lastIndexAtOrBefore<T>(arr: readonly T[], target: string, key: (t: T) => string): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= target) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Read-only point-in-time view of one dataset. Accessors never return data
 * dated after `asOf` (or, in 'open' mode, on `asOf` itself), nor level points
 * whose `availableOn` is later than the cut.
 */
/**
 * Bars / points any indicator may look back over. Fixed for live and
 * historical runs alike, so a date scores the same either way, and it keeps
 * a 20-year replay fast.
 */
export const MAX_LOOKBACK = 600;

export class PointInTime {
  constructor(
    readonly data: MarketDataset,
    readonly asOf: string,
    readonly mode: CutMode = 'close',
  ) {}

  /** Last date whose bars may be seen. */
  private get barCut(): string {
    return this.mode === 'close' ? this.asOf : prevDay(this.asOf);
  }

  has(id: string): boolean {
    const s = this.data.series[id];
    if (!s) return false;
    return s.kind === 'bars' ? this.bars(id).length > 0 : this.levels(id).length > 0;
  }

  meta(id: string): SeriesMeta | null {
    return this.data.series[id]?.meta ?? null;
  }

  /** Bars through the cut, oldest first. */
  bars(id: string): Bar[] {
    const s = this.data.series[id];
    if (!s || s.kind !== 'bars') return [];
    const idx = lastIndexAtOrBefore(s.bars, this.barCut, (b) => b.date);
    return idx < 0 ? [] : s.bars.slice(Math.max(0, idx + 1 - MAX_LOOKBACK), idx + 1);
  }

  closes(id: string): number[] {
    const s = this.data.series[id];
    if (s && s.kind === 'level') return this.levels(id).map((p) => p.value);
    return this.bars(id).map((b) => b.close);
  }

  /** Level points published by the cut, oldest first. */
  levels(id: string): LevelPoint[] {
    const s = this.data.series[id];
    if (!s) return [];
    if (s.kind === 'bars') return this.bars(id).map((b) => ({ date: b.date, value: b.close }));
    // Observation dates are sorted, availability dates nearly so; scan the tail.
    const cut = this.mode === 'close' ? this.asOf : prevDay(this.asOf);
    const idx = lastIndexAtOrBefore(s.points, cut, (p) => p.date);
    const out: LevelPoint[] = [];
    // Weekly series publish with a lag, so scan a little further back than the window.
    for (let i = Math.max(0, idx + 1 - MAX_LOOKBACK - 30); i <= idx; i++) {
      const p = s.points[i];
      if ((p.availableOn ?? p.date) <= cut) out.push(p);
    }
    return out;
  }

  /** Latest published value and its observation date. */
  latest(id: string): LevelPoint | null {
    const l = this.levels(id);
    return l.length ? l[l.length - 1] : null;
  }
}

/** Calendar day before a YYYY-MM-DD date. */
export function prevDay(ymd: string): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Next weekday after `ymd` (holidays are not skipped; publication lags are approximate). */
export function nextWeekday(ymd: string): string {
  let d = addDays(ymd, 1);
  for (;;) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
}

// ─── Small numeric helpers shared by the indicators ─────────────────────────

export function sma(values: readonly number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

/** Annualised close-to-close realised volatility over `period` returns, decimal. */
export function realizedVol(closes: readonly number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v * 252);
}

/** Percent change over `lookback` observations, as a decimal. */
export function pctChange(values: readonly number[], lookback: number): number | null {
  if (values.length <= lookback) return null;
  const a = values[values.length - 1 - lookback];
  const b = values[values.length - 1];
  return a > 0 ? b / a - 1 : null;
}

/** Absolute change over `lookback` observations. */
export function change(values: readonly number[], lookback: number): number | null {
  if (values.length <= lookback) return null;
  return values[values.length - 1] - values[values.length - 1 - lookback];
}

/** Percentile rank (0–1) of the last value within the trailing `window` values. */
export function percentileRank(values: readonly number[], window: number): number | null {
  if (values.length < Math.min(window, 60)) return null;
  const w = values.slice(-window);
  const last = w[w.length - 1];
  let below = 0;
  for (const v of w) if (v < last) below++;
  return below / (w.length - 1 || 1);
}

/** Ratio series of two close series aligned by date. */
export function ratioCloses(a: readonly { date: string; close: number }[], b: readonly { date: string; close: number }[]): number[] {
  // Both inputs are sorted by date: merge instead of building a map per call
  // (this runs for every session of the 20-year replay).
  const out: number[] = [];
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j].date < x.date) j++;
    if (j < b.length && b[j].date === x.date) {
      const y = b[j].close;
      if (y && y > 0) out.push(x.close / y);
    }
  }
  return out;
}

/** Linear map of x from [lo, hi] onto [0, 1], clamped. lo may exceed hi for inverse maps. */
export function ramp(x: number, lo: number, hi: number): number {
  if (lo === hi) return x >= hi ? 1 : 0;
  const t = (x - lo) / (hi - lo);
  return Math.max(0, Math.min(1, t));
}
