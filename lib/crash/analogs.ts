/**
 * "Days like today": past sessions whose market looked like today's, and
 * what actually followed them. This is how the historical engine shapes the
 * live Put Hunter: every candidate put is re-priced on each similar past day's
 * real next-week move (underlying return and volatility-index change), so the
 * ranking reflects what paid in similar conditions, not fixed rules alone.
 *
 * Honesty rules:
 *  - Similar days are chosen only from what was known on each day (the
 *    point-in-time timeline); outcomes are the real moves that followed.
 *  - Only days with a complete forward window are used, so the most recent
 *    sessions never count as "nothing happened".
 *  - Re-pricing the put on those moves is a MODEL (Black-Scholes with the
 *    contract's own IV scaled by the volatility-index change). It is labelled
 *    THEORETICAL wherever it is shown. Real historical option quotes are not
 *    loaded.
 *  - Settings "learned from history" are chosen on days before SPLIT_DATE and
 *    reported alongside how they did on days after it.
 */
import { blackScholes } from './pricing';
import type { Regime } from './regime';
import type { TimelinePoint } from './history/timeline';

export const SPLIT_DATE = '2019-01-01';

export type StageGroup = 'calm' | 'warning' | 'stress';
export function stageGroup(r: Regime): StageGroup {
  if (r === 'NORMAL' || r === 'EARLY WARNING') return 'calm';
  if (r === 'ELEVATED RISK' || r === 'PRE-CRASH WATCH') return 'warning';
  return 'stress';
}

export interface TodayState {
  date: string;
  score: number | null;
  vix: number | null;
  regime: Regime;
}

export interface Outcome {
  date: string;
  /** Underlying return over the hold window (close to close). */
  ret: number;
  /** Volatility-index ratio over the hold window (after / before). */
  volRatio: number;
  volBefore: number;
  volAfter: number;
  /** Worst close-to-close drawdown from the start within 20 sessions. */
  maxDrop20: number;
}

export interface AnalogSet {
  today: TodayState;
  holdSessions: number;
  tolerance: { score: number; vixPct: number; sameStage: boolean };
  days: Outcome[];
  /** Runs of similar days merged when within 5 sessions: roughly independent episodes. */
  episodes: number;
  first: string | null;
  last: string | null;
  stats: {
    pDrop5in20: number | null;
    pDrop10in20: number | null;
    pVolUp10ptsInHold: number | null;
    medianRetHold: number | null;
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param tl point-in-time timeline (score, regime, vix per session)
 * @param closes underlying closes by date (SPY, QQQ, …); defaults to the timeline's SPY
 * @param vols volatility index by date for the underlying (VIX, VXN, RVX); defaults to the timeline's VIX
 */
export function findAnalogs(args: {
  tl: readonly TimelinePoint[];
  today: TodayState;
  holdSessions: number;
  closes?: Map<string, number>;
  vols?: Map<string, number>;
  minDays?: number;
}): AnalogSet {
  const { tl, today, holdSessions } = args;
  const minDays = args.minDays ?? 40;
  const closeOf = (p: TimelinePoint) => (args.closes ? args.closes.get(p.date) ?? null : p.spy);
  const volOf = (p: TimelinePoint) => (args.vols ? args.vols.get(p.date) ?? null : p.vix);
  const fwd = Math.max(20, holdSessions);
  const usable = tl.length - fwd; // last index with a complete forward window is usable-1
  const tries: { score: number; vixPct: number; sameStage: boolean }[] = [
    { score: 8, vixPct: 0.2, sameStage: true },
    { score: 12, vixPct: 0.3, sameStage: true },
    { score: 15, vixPct: 0.4, sameStage: false },
    { score: 20, vixPct: 0.6, sameStage: false },
  ];
  let chosen = tries[tries.length - 1];
  let idx: number[] = [];
  for (const t of tries) {
    chosen = t;
    idx = [];
    for (let i = 0; i < usable; i++) {
      const p = tl[i];
      if (p.insufficient || p.date >= today.date) continue;
      if (today.score != null && (p.score == null || Math.abs(p.score - today.score) > t.score)) continue;
      const v = volOf(p);
      if (today.vix != null && (v == null || Math.abs(v / today.vix - 1) > t.vixPct)) continue;
      if (t.sameStage && stageGroup(p.regime) !== stageGroup(today.regime)) continue;
      idx.push(i);
    }
    if (idx.length >= minDays) break;
  }

  const days: Outcome[] = [];
  for (const i of idx) {
    const p0 = tl[i];
    const ph = tl[i + holdSessions];
    const c0 = closeOf(p0);
    const ch = closeOf(ph);
    const v0 = volOf(p0);
    const vh = volOf(ph);
    if (c0 == null || ch == null || v0 == null || vh == null || !(c0 > 0) || !(v0 > 0)) continue;
    let low = c0;
    for (let k = 1; k <= 20 && i + k < tl.length; k++) {
      const c = closeOf(tl[i + k]);
      if (c != null && c < low) low = c;
    }
    days.push({ date: p0.date, ret: ch / c0 - 1, volRatio: vh / v0, volBefore: v0, volAfter: vh, maxDrop20: low / c0 - 1 });
  }

  let episodes = 0;
  let lastI = -999;
  for (const i of idx) {
    if (i - lastI > 5) episodes += 1;
    lastI = i;
  }
  const n = days.length;
  const share = (f: (d: Outcome) => boolean) => (n ? days.filter(f).length / n : null);
  return {
    today,
    holdSessions,
    tolerance: chosen,
    days,
    episodes,
    first: days[0]?.date ?? null,
    last: days[n - 1]?.date ?? null,
    stats: {
      pDrop5in20: share((d) => d.maxDrop20 <= -0.05),
      pDrop10in20: share((d) => d.maxDrop20 <= -0.1),
      pVolUp10ptsInHold: share((d) => d.volAfter - d.volBefore >= 10),
      medianRetHold: median(days.map((d) => d.ret)),
    },
  };
}

export interface HistoricalPayoff {
  /** Similar days used. */
  n: number;
  /** Mean of (value after the hold / price paid). */
  meanMultiple: number;
  medianMultiple: number;
  /** Share of similar days on which the put was worth at least what was paid. */
  hitRate: number;
  /** Share of similar days on which it was worth 3× or more. */
  p3x: number;
  /** Same mean multiple on days before / after SPLIT_DATE (null when too few days). */
  meanBefore: number | null;
  meanAfter: number | null;
  label: 'THEORETICAL';
}

/**
 * Re-price one live put on each similar day's real next-window move.
 * `iv` is the contract's own implied vol today; it is scaled by the
 * volatility-index ratio observed after each similar day.
 */
export function historicalPayoff(args: {
  S: number;
  K: number;
  dte: number;
  entry: number;
  iv: number;
  r: number;
  q: number;
  analogs: AnalogSet;
}): HistoricalPayoff | null {
  const { S, K, dte, entry, iv, r, q, analogs } = args;
  if (!(entry > 0) || !(iv > 0) || !(S > 0)) return null;
  const holdCal = Math.round((analogs.holdSessions * 7) / 5);
  const T = Math.max(0, (dte - holdCal) / 365);
  const mults: { m: number; date: string }[] = [];
  for (const d of analogs.days) {
    const v = blackScholes({ type: 'put', S: S * (1 + d.ret), K, T, r, q, sigma: Math.max(0.01, iv * d.volRatio) }).price;
    if (Number.isFinite(v)) mults.push({ m: v / entry, date: d.date });
  }
  if (mults.length < 10) return null;
  const ms = mults.map((x) => x.m);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const before = mults.filter((x) => x.date < SPLIT_DATE).map((x) => x.m);
  const after = mults.filter((x) => x.date >= SPLIT_DATE).map((x) => x.m);
  return {
    n: ms.length,
    meanMultiple: mean(ms),
    medianMultiple: median(ms) ?? 0,
    hitRate: ms.filter((m) => m >= 1).length / ms.length,
    p3x: ms.filter((m) => m >= 3).length / ms.length,
    meanBefore: before.length >= 10 ? mean(before) : null,
    meanAfter: after.length >= 10 ? mean(after) : null,
    label: 'THEORETICAL',
  };
}

export interface BucketResult {
  id: string;
  label: string;
  contracts: number;
  meanBefore: number | null;
  meanAfter: number | null;
}

export interface LearnedPick {
  /** Bucket with the best mean multiple on days before SPLIT_DATE. */
  best: BucketResult | null;
  /** Whether that bucket also ranked in the top half on days after SPLIT_DATE. */
  heldUp: boolean | null;
  buckets: BucketResult[];
  splitDate: string;
}

const DELTA_BUCKETS: [number, number, string][] = [
  [0, 0.02, '|Δ| under 0.02'],
  [0.02, 0.05, '|Δ| 0.02–0.05'],
  [0.05, 0.1, '|Δ| 0.05–0.10'],
  [0.1, 0.2, '|Δ| 0.10–0.20'],
  [0.2, 0.36, '|Δ| 0.20–0.36'],
  [0.36, 1, '|Δ| over 0.36'],
];
const DTE_BUCKETS: [number, number, string][] = [
  [0, 21, 'under 21 days'],
  [21, 45, '21–45 days'],
  [45, 90, '45–90 days'],
  [90, 10000, '90+ days'],
];

export function bucketOf(absDelta: number, dte: number): { id: string; label: string } | null {
  const d = DELTA_BUCKETS.find(([lo, hi]) => absDelta >= lo && absDelta < hi);
  const t = DTE_BUCKETS.find(([lo, hi]) => dte >= lo && dte < hi);
  if (!d || !t) return null;
  return { id: `${d[2]}|${t[2]}`, label: `${d[2]}, ${t[2]}` };
}

/** Choose the delta × days-left bucket that paid best before SPLIT_DATE, and check it on later days. */
export function learnBucket(items: { absDelta: number; dte: number; payoff: HistoricalPayoff | null }[]): LearnedPick {
  const map = new Map<string, { label: string; before: number[]; after: number[]; n: number }>();
  for (const it of items) {
    const b = bucketOf(it.absDelta, it.dte);
    if (!b || !it.payoff) continue;
    const e = map.get(b.id) ?? { label: b.label, before: [], after: [], n: 0 };
    e.n += 1;
    if (it.payoff.meanBefore != null) e.before.push(it.payoff.meanBefore);
    if (it.payoff.meanAfter != null) e.after.push(it.payoff.meanAfter);
    map.set(b.id, e);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const buckets: BucketResult[] = Array.from(map.entries()).map(([id, e]) => ({ id, label: e.label, contracts: e.n, meanBefore: avg(e.before), meanAfter: avg(e.after) }));
  const ranked = buckets.filter((b) => b.meanBefore != null).sort((a, b) => b.meanBefore! - a.meanBefore!);
  const best = ranked[0] ?? null;
  let heldUp: boolean | null = null;
  if (best && best.meanAfter != null) {
    const after = buckets.filter((b) => b.meanAfter != null).sort((a, b) => b.meanAfter! - a.meanAfter!);
    const rank = after.findIndex((b) => b.id === best.id);
    heldUp = after.length >= 2 ? rank < Math.ceil(after.length / 2) : null;
  }
  return { best, heldUp, buckets, splitDate: SPLIT_DATE };
}
