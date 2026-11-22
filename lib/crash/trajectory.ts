/**
 * Crash trajectories: where today's fall sits next to past crashes, and what
 * history says could come next.
 *
 * Everything is measured in % from each crash's own peak, so past crashes and
 * today line up even though prices have grown a lot since then (a 20% fall in
 * 2008 and a 20% fall today are the same distance on this chart).
 *
 * Three kinds of path come out of this module:
 *  - HISTORY: real closing prices of past crashes (facts).
 *  - FROM HERE: for every past crash that fell at least as far as today, what
 *    it did next, re-based to today's level (history, not a forecast).
 *  - WORSE THAN EVER: a stress scenario built on request: deeper and faster
 *    than the worst crash in the data. It is an assumption, labelled as such.
 */
import type { Bar } from './series';

export interface Episode {
  id: string;
  label: string;
  peakDate: string;
  troughDate: string;
  /** Deepest close-to-peak fall, negative (e.g. −0.55). */
  depth: number;
  /** Sessions from peak to trough. */
  sessionsToTrough: number;
  /** % from peak for each session after the peak (index 0 = peak = 0). */
  path: number[];
}

export interface CurrentFall {
  peakDate: string;
  peak: number;
  last: number;
  lastDate: string;
  /** Negative, e.g. −0.115. */
  depth: number;
  /** Sessions since the peak. */
  sessions: number;
  path: number[];
}

const LABELS: [string, string][] = [
  ['1998', '1998 LTCM / Russia'],
  ['2000', '2000–02 dot-com'],
  ['2007', '2007–09 financial crisis'],
  ['2010', '2010 flash crash'],
  ['2011', '2011 US downgrade'],
  ['2015', '2015–16 China / oil'],
  ['2018', '2018 Q4 sell-off'],
  ['2020', '2020 COVID crash'],
  ['2022', '2022 rate shock'],
];
const labelFor = (peakDate: string) => LABELS.find(([y]) => peakDate.startsWith(y))?.[1] ?? `${peakDate.slice(0, 4)} fall`;

/**
 * Falls of at least `minDepth` from an all-time closing high, measured until
 * the old high is regained (or the data ends). The last, unfinished fall is
 * not returned here; see currentFall().
 */
export function findEpisodes(bars: readonly Bar[], minDepth = 0.18, maxSessions = 750): Episode[] {
  const out: Episode[] = [];
  let peakI = 0;
  let troughI = 0;
  for (let i = 1; i <= bars.length; i++) {
    const done = i === bars.length;
    if (!done && bars[i].close < bars[peakI].close) {
      if (bars[i].close < bars[troughI].close) troughI = i;
      continue;
    }
    // New high (or end of data): close the episode that started at peakI.
    if (!done) {
      const depth = bars[troughI].close / bars[peakI].close - 1;
      if (depth <= -minDepth) {
        const p0 = bars[peakI].close;
        const end = Math.min(i, peakI + maxSessions);
        out.push({
          id: bars[peakI].date.slice(0, 4),
          label: labelFor(bars[peakI].date),
          peakDate: bars[peakI].date,
          troughDate: bars[troughI].date,
          depth,
          sessionsToTrough: troughI - peakI,
          path: bars.slice(peakI, end + 1).map((b) => b.close / p0 - 1),
        });
      }
      peakI = i;
      troughI = i;
    }
  }
  return out;
}

/** The fall in progress: from the highest close so far to the latest price. */
export function currentFall(bars: readonly Bar[], livePrice?: number | null, liveDate?: string | null): CurrentFall | null {
  if (!bars.length) return null;
  let peakI = 0;
  for (let i = 1; i < bars.length; i++) if (bars[i].close >= bars[peakI].close) peakI = i;
  const p0 = bars[peakI].close;
  const path = bars.slice(peakI).map((b) => b.close / p0 - 1);
  let last = bars[bars.length - 1].close;
  let lastDate = bars[bars.length - 1].date;
  if (livePrice != null && livePrice > 0 && liveDate && liveDate > lastDate) {
    last = livePrice;
    lastDate = liveDate;
    path.push(last / p0 - 1);
  }
  return { peakDate: bars[peakI].date, peak: p0, last, lastDate, depth: Math.min(0, last / p0 - 1), sessions: path.length - 1, path };
}

export interface FromHere {
  /** Past crashes that fell at least as far as today. */
  used: { id: string; label: string; reachedOn: number }[];
  /**
   * For each session ahead (index 0 = today), price relative to today:
   * median and worst across the past crashes that reached today's depth.
   */
  median: number[];
  worst: number[];
  best: number[];
  /** Further fall (lowest close) within 1, 3 and 6 months, per past crash. */
  horizons: { sessions: number; label: string; median: number | null; worst: number | null; perCrash: { id: string; low: number }[] }[];
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

/** What past crashes did after falling as far as today has. */
export function fromHere(episodes: readonly Episode[], depthNow: number, ahead = 250): FromHere {
  const series: { id: string; label: string; reachedOn: number; rel: number[] }[] = [];
  for (const e of episodes) {
    const i0 = e.path.findIndex((d) => d <= depthNow);
    if (i0 < 0) continue;
    const base = 1 + e.path[i0];
    const rel: number[] = [];
    for (let k = 0; k <= ahead && i0 + k < e.path.length; k++) rel.push((1 + e.path[i0 + k]) / base);
    series.push({ id: e.id, label: e.label, reachedOn: i0, rel });
  }
  const median: number[] = [];
  const worst: number[] = [];
  const best: number[] = [];
  for (let k = 0; k <= ahead; k++) {
    // Episodes that recovered before day k stay at their last value (back at the old high).
    const xs = series.map((s) => s.rel[Math.min(k, s.rel.length - 1)]);
    if (!xs.length) break;
    median.push(quantile(xs, 0.5));
    worst.push(Math.min(...xs));
    best.push(Math.max(...xs));
  }
  const horizons = [
    { sessions: 21, label: '1 month' },
    { sessions: 63, label: '3 months' },
    { sessions: 126, label: '6 months' },
  ].map((h) => {
    const perCrash = series.map((s) => ({ id: s.id, low: Math.min(...s.rel.slice(0, h.sessions + 1)) - 1 }));
    const lows = perCrash.map((p) => p.low);
    return { ...h, median: lows.length ? quantile(lows, 0.5) : null, worst: lows.length ? Math.min(...lows) : null, perCrash };
  });
  return { used: series.map(({ id, label, reachedOn }) => ({ id, label, reachedOn })), median, worst, best, horizons };
}

export interface Scenario {
  label: string;
  /** Final fall from the peak, e.g. −0.69. */
  troughFromPeak: number;
  /** Price relative to today, per session ahead. */
  rel: number[];
  basedOn: string;
  depthFactor: number;
  speedFactor: number;
}

/**
 * "Worse than any crash in the data": the worst past crash's shape from
 * today's depth onward, made `depthFactor` times as deep (from the peak) and
 * `speedFactor` times as fast, without its bounces. An assumption for stress-testing, not a forecast.
 */
export function worseThanEver(episodes: readonly Episode[], depthNow: number, depthFactor = 1.25, speedFactor = 1.5, ahead = 250): Scenario | null {
  if (!episodes.length) return null;
  const worst = episodes.reduce((a, b) => (b.depth < a.depth ? b : a));
  const target = Math.max(-0.95, worst.depth * depthFactor);
  if (target >= depthNow) return null;
  const i0 = Math.max(0, worst.path.findIndex((d) => d <= depthNow));
  const iT = worst.path.indexOf(Math.min(...worst.path));
  const base = Math.log(1 + worst.path[i0]);
  const span = Math.log(1 + worst.depth) - base; // negative
  const want = Math.log(1 + target) - Math.log(1 + depthNow); // negative
  const rel: number[] = [];
  let low = 0;
  for (let k = 0; k <= ahead; k++) {
    const j = Math.min(iT, i0 + Math.round(k * speedFactor));
    const frac = span !== 0 ? (Math.log(1 + worst.path[j]) - base) / span : 1; // 0 at today's depth, 1 at the trough
    // A worse-than-ever crash keeps falling: the worst crash's bounces are left out (running low only).
    low = Math.max(low, Math.min(1, frac));
    rel.push(Math.exp(low * want));
  }
  return {
    label: 'Worse than every past crash (your scenario)',
    troughFromPeak: target,
    rel,
    basedOn: worst.label,
    depthFactor,
    speedFactor,
  };
}

/** Daily-return beta of `fund` to `index` over their common dates. */
export function beta(fund: readonly Bar[], index: readonly Bar[], minObs = 60): number | null {
  const idx = new Map(index.map((b) => [b.date, b.close]));
  const xs: number[] = [];
  const ys: number[] = [];
  let prevF: number | null = null;
  let prevI: number | null = null;
  for (const b of fund) {
    const i = idx.get(b.date);
    if (i == null) continue;
    if (prevF != null && prevI != null && prevF > 0 && prevI > 0) {
      ys.push(Math.log(b.close / prevF));
      xs.push(Math.log(i / prevI));
    }
    prevF = b.close;
    prevI = i;
  }
  if (xs.length < minObs) return null;
  const mx = xs.reduce((a, c) => a + c, 0) / xs.length;
  const my = ys.reduce((a, c) => a + c, 0) / ys.length;
  let cov = 0;
  let vx = 0;
  for (let k = 0; k < xs.length; k++) {
    cov += (xs[k] - mx) * (ys[k] - my);
    vx += (xs[k] - mx) ** 2;
  }
  return vx > 0 ? cov / vx : null;
}

/** Sessions until a calendar date `dte` days away (≈ 252 trading days a year). */
export const sessionsFor = (dte: number) => Math.max(0, Math.round((dte * 252) / 365));

/**
 * Value of a put at expiration if the index follows `rel` (price relative to
 * today) and the fund moves `beta` times as much in log terms.
 */
export function putAtExpiry(args: { S: number; K: number; dte: number; beta: number; rel: readonly number[] }): number {
  const n = Math.min(args.rel.length - 1, sessionsFor(args.dte));
  const r = args.rel[n] ?? 1;
  const fund = args.S * Math.exp(args.beta * Math.log(r));
  return Math.max(0, args.K - fund);
}

/**
 * Best value at expiration-or-earlier on the path, counting only intrinsic
 * value (what the put is worth if exercised at that close). Conservative: it
 * ignores time value and any volatility spike.
 */
export function bestIntrinsicOnPath(args: { S: number; K: number; dte: number; beta: number; rel: readonly number[] }): number {
  const n = Math.min(args.rel.length - 1, sessionsFor(args.dte));
  let best = 0;
  for (let k = 0; k <= n; k++) best = Math.max(best, args.K - args.S * Math.exp(args.beta * Math.log(args.rel[k])));
  return Math.max(0, best);
}
