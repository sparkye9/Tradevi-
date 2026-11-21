/**
 * Signal evaluation against detected declines: first warning, lead time,
 * the reading 90/60/30/10/1 days before each decline, false alarms,
 * missed declines, and in-sample / out-of-sample / walk-forward splits.
 *
 * A "signal" is a rule over the historical timeline (score at or above a
 * threshold, or one of a set of regimes). The timeline itself is point-in-
 * time, so these statistics use no future information; only the scoring of
 * whether a warning was "followed by a decline" looks forward, which is the
 * point of a backtest.
 */
import type { Regime } from '../regime';
import { addDays } from '../series';
import type { DeclineEvent } from './events';
import type { TimelinePoint } from './timeline';

export type SignalRule =
  | { kind: 'score'; min: number; label?: string }
  | { kind: 'regimes'; regimes: Regime[]; label?: string };

export function ruleLabel(r: SignalRule): string {
  if (r.label) return r.label;
  return r.kind === 'score' ? `Risk score ≥ ${r.min}` : r.regimes.join(' or ');
}

export function isOn(p: TimelinePoint, r: SignalRule): boolean {
  if (p.insufficient) return false;
  if (r.kind === 'score') return p.score != null && p.score >= r.min;
  return r.regimes.includes(p.regime);
}

export interface EvalOptions {
  /** Calendar days before a decline in which a warning counts as advance warning. */
  maxLeadDays: number;
  /** A warning needs at least this many days of lead to count as "in advance". */
  minLeadDays: number;
  /** Calendar days after a warning starts within which a decline must begin, or it is a false alarm. */
  horizonDays: number;
  /** Off-gaps of this many sessions or fewer do not end an episode. */
  mergeGap: number;
}

export const DEFAULT_EVAL: EvalOptions = { maxLeadDays: 120, minLeadDays: 5, horizonDays: 120, mergeGap: 5 };

export interface Episode {
  start: string;
  end: string;
  sessions: number;
  outcome: 'preceded decline' | 'during decline' | 'false alarm' | 'pending';
  /** For 'preceded decline': the decline it preceded. */
  eventCross?: string;
}

export interface Checkpoint {
  daysBefore: number;
  date: string | null;
  score: number | null;
  regime: Regime | null;
  on: boolean;
}

export interface EventEvaluation {
  event: DeclineEvent;
  firstWarning: string | null;
  /** Calendar days from the first warning to the decline's threshold crossing. */
  leadDays: number | null;
  /** First warning lies before the start of the lead window (the signal was already on). */
  alreadyOn: boolean;
  warned: boolean;
  checkpoints: Checkpoint[];
}

export interface SignalStats {
  declines: number;
  warned: number;
  missed: number;
  /** warned / declines */
  hitRate: number | null;
  avgLeadDays: number | null;
  medianLeadDays: number | null;
  episodes: number;
  falseAlarms: number;
  /** Episodes followed by a decline within the horizon. */
  preceded: number;
  /** false alarms / (false alarms + episodes that preceded a decline) */
  falseAlarmRate: number | null;
  avgEpisodeSessions: number | null;
  /** Share of sessions with the signal on. */
  timeOn: number | null;
}

export interface SignalReport {
  rule: SignalRule;
  options: EvalOptions;
  events: EventEvaluation[];
  episodes: Episode[];
  stats: SignalStats;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function findEpisodes(tl: readonly TimelinePoint[], rule: SignalRule, mergeGap: number): { start: string; end: string; sessions: number }[] {
  const out: { start: string; end: string; sessions: number }[] = [];
  let cur: { start: string; end: string; sessions: number; lastIdx: number } | null = null;
  tl.forEach((p, i) => {
    if (!isOn(p, rule)) return;
    if (cur && i - cur.lastIdx - 1 <= mergeGap) {
      cur.end = p.date;
      cur.sessions += i - cur.lastIdx;
      cur.lastIdx = i;
    } else {
      if (cur) out.push({ start: cur.start, end: cur.end, sessions: cur.sessions });
      cur = { start: p.date, end: p.date, sessions: 1, lastIdx: i };
    }
  });
  if (cur) {
    const c = cur as { start: string; end: string; sessions: number };
    out.push({ start: c.start, end: c.end, sessions: c.sessions });
  }
  return out;
}

function pointAtOrBefore(tl: readonly TimelinePoint[], date: string): TimelinePoint | null {
  let lo = 0;
  let hi = tl.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl[mid].date <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? null : tl[ans];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function evaluateSignal(
  tl: readonly TimelinePoint[],
  events: readonly DeclineEvent[],
  rule: SignalRule,
  opts: EvalOptions = DEFAULT_EVAL,
  range?: { from?: string; to?: string },
): SignalReport {
  const from = range?.from ?? tl[0]?.date ?? '';
  const to = range?.to ?? tl[tl.length - 1]?.date ?? '';
  const lastDate = tl[tl.length - 1]?.date ?? to;
  const inRange = tl.filter((p) => p.date >= from && p.date <= to);
  const eps = findEpisodes(tl, rule, opts.mergeGap);
  const evs = events.filter((e) => e.crossDate >= from && e.crossDate <= to);

  const evals: EventEvaluation[] = evs.map((e) => {
    const winStart = addDays(e.crossDate, -opts.maxLeadDays);
    // The earliest warning still "connected" to the decline: an episode that
    // overlaps the lead window and starts before the threshold crossing.
    const ep = eps.find((x) => x.end >= winStart && x.start < e.crossDate);
    const firstWarning = ep ? ep.start : null;
    const leadDays = firstWarning ? dayDiff(firstWarning, e.crossDate) : null;
    const checkpoints: Checkpoint[] = [90, 60, 30, 10, 1].map((d) => {
      const p = pointAtOrBefore(tl, addDays(e.crossDate, -d));
      return { daysBefore: d, date: p?.date ?? null, score: p?.score ?? null, regime: p && !p.insufficient ? p.regime : null, on: p ? isOn(p, rule) : false };
    });
    return {
      event: e,
      firstWarning,
      leadDays,
      alreadyOn: !!firstWarning && firstWarning < winStart,
      warned: leadDays != null && leadDays >= opts.minLeadDays,
      checkpoints,
    };
  });

  const episodes: Episode[] = eps
    .filter((x) => x.start >= from && x.start <= to)
    .map((x) => {
      const during = events.find((e) => x.start >= e.crossDate && (e.endDate == null || x.start <= e.endDate));
      if (during) return { ...x, outcome: 'during decline' as const };
      const next = events.find((e) => e.crossDate >= x.start && dayDiff(x.start, e.crossDate) <= opts.horizonDays);
      if (next) return { ...x, outcome: 'preceded decline' as const, eventCross: next.crossDate };
      if (dayDiff(x.start, lastDate) < opts.horizonDays) return { ...x, outcome: 'pending' as const };
      return { ...x, outcome: 'false alarm' as const };
    });

  const leads = evals.filter((x) => x.warned).map((x) => x.leadDays as number);
  const fa = episodes.filter((x) => x.outcome === 'false alarm').length;
  const pre = episodes.filter((x) => x.outcome === 'preceded decline').length;
  const stats: SignalStats = {
    declines: evals.length,
    warned: leads.length,
    missed: evals.length - leads.length,
    hitRate: evals.length ? leads.length / evals.length : null,
    avgLeadDays: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null,
    medianLeadDays: median(leads),
    episodes: episodes.length,
    falseAlarms: fa,
    preceded: pre,
    falseAlarmRate: fa + pre ? fa / (fa + pre) : null,
    avgEpisodeSessions: episodes.length ? episodes.reduce((a, b) => a + b.sessions, 0) / episodes.length : null,
    timeOn: inRange.length ? inRange.filter((p) => isOn(p, rule)).length / inRange.length : null,
  };
  return { rule, options: opts, events: evals, episodes, stats };
}

/** Balance of catching declines and avoiding false alarms (F1). 0 when there is nothing to catch. */
export function signalObjective(s: SignalStats): number {
  const recall = s.hitRate ?? 0;
  const precision = s.falseAlarmRate == null ? 0 : 1 - s.falseAlarmRate;
  return recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
}

export interface SplitReport {
  splitDate: string;
  inSample: SignalStats;
  outOfSample: SignalStats;
}

export function splitEvaluate(tl: readonly TimelinePoint[], events: readonly DeclineEvent[], rule: SignalRule, splitDate: string, opts: EvalOptions = DEFAULT_EVAL): SplitReport {
  return {
    splitDate,
    inSample: evaluateSignal(tl, events, rule, opts, { to: addDays(splitDate, -1) }).stats,
    outOfSample: evaluateSignal(tl, events, rule, opts, { from: splitDate }).stats,
  };
}

export interface WalkForwardFold {
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  chosenMin: number;
  /** True when the training window had no decline, so the default threshold was kept. */
  defaulted: boolean;
  trainObjective: number;
  test: SignalStats;
}

export interface WalkForwardReport {
  candidates: number[];
  trainYears: number;
  testYears: number;
  folds: WalkForwardFold[];
  /** Out-of-sample totals across all test windows. */
  combined: { declines: number; warned: number; falseAlarms: number; episodes: number; hitRate: number | null; falseAlarmRate: number | null };
}

/**
 * Walk-forward test of the score threshold: choose the threshold on each
 * training window only, then measure it on the following unseen window.
 */
export function walkForward(
  tl: readonly TimelinePoint[],
  events: readonly DeclineEvent[],
  opts: { candidates: number[]; trainYears: number; testYears: number; defaultMin: number; eval?: EvalOptions },
): WalkForwardReport {
  const ev = opts.eval ?? DEFAULT_EVAL;
  const first = tl[0]?.date;
  const last = tl[tl.length - 1]?.date;
  const folds: WalkForwardFold[] = [];
  if (first && last) {
    let trainFrom = first;
    for (;;) {
      const trainTo = addDays(trainFrom, Math.round(opts.trainYears * 365.25) - 1);
      const testFrom = addDays(trainTo, 1);
      const testTo = addDays(testFrom, Math.round(opts.testYears * 365.25) - 1);
      if (testFrom > last) break;
      let best = opts.defaultMin;
      let bestObj = -1;
      const trainEvents = events.filter((e) => e.crossDate >= trainFrom && e.crossDate <= trainTo).length;
      for (const c of opts.candidates) {
        const s = evaluateSignal(tl, events, { kind: 'score', min: c }, ev, { from: trainFrom, to: trainTo }).stats;
        const o = signalObjective(s);
        if (o > bestObj + 1e-9) {
          bestObj = o;
          best = c;
        }
      }
      const defaulted = trainEvents === 0 || bestObj <= 0;
      const chosenMin = defaulted ? opts.defaultMin : best;
      const test = evaluateSignal(tl, events, { kind: 'score', min: chosenMin }, ev, { from: testFrom, to: testTo < last ? testTo : last }).stats;
      folds.push({ trainFrom, trainTo, testFrom, testTo: testTo < last ? testTo : last, chosenMin, defaulted, trainObjective: Math.max(0, bestObj), test });
      trainFrom = addDays(trainFrom, Math.round(opts.testYears * 365.25));
    }
  }
  const sum = (k: 'declines' | 'warned' | 'falseAlarms' | 'episodes') => folds.reduce((a, f) => a + f.test[k], 0);
  const declines = sum('declines');
  const warned = sum('warned');
  const falseAlarms = sum('falseAlarms');
  const preceded = folds.reduce((a, f) => a + f.test.preceded, 0);
  return {
    candidates: opts.candidates,
    trainYears: opts.trainYears,
    testYears: opts.testYears,
    folds,
    combined: {
      declines,
      warned,
      falseAlarms,
      episodes: sum('episodes'),
      hitRate: declines ? warned / declines : null,
      falseAlarmRate: falseAlarms + preceded ? falseAlarms / (falseAlarms + preceded) : null,
    },
  };
}
