/**
 * Futures readiness: hard gates + weighted score → grade → status.
 *
 * Replaces the all-AND `setupQuality` label. The structure reads, levels and
 * dealing-range setup are unchanged (lib/trendBias.ts, lib/futuresSetups.ts);
 * this module only changes how they combine.
 *
 *   Hard gates (force WAIT on their own): session window, news blackout, data freshness.
 *   Scored (0–100): Daily + 4H alignment, Weekly agreement, no conflict, Daily zone
 *   (ATR band), 4H zone (ATR band), invalidation, swing depth, R:R to TP1.
 *
 *   A ≥ 75 → READY · B 60–74 → WATCH · C < 60 → WAIT
 */
import type { StructureLevels, Timeframe, TrendRead, Bias } from './trendBias';
import type { TradeSetup } from './futuresSetups';
import type { CalendarEvent } from './economicCalendar';
import { marketClock } from './powerHour';
import { atr, type Candle } from './indicators';
import { READINESS_CONFIG } from './readinessConfig';

export type ReadinessStatus = 'READY' | 'WATCH' | 'WAIT';
export type Grade = 'A' | 'B' | 'C';
export type BarInterval = '15m' | '1h' | '1d' | '1wk';

export interface ReadinessComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  /** passed = full points, partial = some, failed = none. */
  state: 'passed' | 'partial' | 'failed';
}

export interface ReadinessResult {
  symbol: string;
  status: ReadinessStatus;
  grade: Grade;
  score: number;
  blocking_gate: string | null;
  passed: string[];
  failed: string[];
  /** Minutes since the newest bar closed; null when no bars came back. */
  data_age_minutes: number | null;
  updated_at: string;
  /** Extra detail for the UI (not part of the spec contract). */
  side: 'long' | 'short' | null;
  headline: string;
  components: ReadinessComponent[];
  gates: { name: string; passed: boolean; detail: string }[];
}

export interface NewestBar {
  interval: BarInterval;
  /** Unix seconds of the bar's open. */
  time: number;
}

export interface ReadinessInput {
  symbol: string;
  now: Date;
  reads: Record<Timeframe, TrendRead>;
  levels: Record<Timeframe, StructureLevels>;
  lastPrice: number | null;
  dailyCandles: Candle[];
  fourHCandles: Candle[];
  swingSetup: TradeSetup;
  newestBar: NewestBar | null;
  /** High-impact calendar events (already filtered or not — the engine filters). */
  events: CalendarEvent[];
  /** False when the calendar feed could not be reached (manual list still applies). */
  calendarAvailable?: boolean;
}

const INTERVAL_SECONDS: Record<BarInterval, number> = {
  '15m': 15 * 60,
  '1h': 3600,
  '1d': 86400,
  '1wk': 7 * 86400,
};

function etMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

function inWindow(mins: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

// ─── Hard gates ─────────────────────────────────────────────────────────────

export function sessionGate(now: Date): { passed: boolean; detail: string } {
  const clock = marketClock(now);
  if (!clock.tradesOpen) return { passed: false, detail: clock.headline };
  const win = READINESS_CONFIG.tradingWindow;
  if (win && !inWindow(etMinutes(now), win.startMinutesEt, win.endMinutesEt)) {
    return { passed: false, detail: `Outside trading window (${win.label}).` };
  }
  return { passed: true, detail: `${clock.session} — Globex open.` };
}

export function newsGate(now: Date, events: CalendarEvent[], calendarAvailable = true): { passed: boolean; detail: string } {
  const cfg = READINESS_CONFIG.news;
  const t = now.getTime();
  const before = cfg.beforeMinutes * 60_000;
  const after = cfg.afterMinutes * 60_000;
  const fromFeed = events.filter((e) => e.impact === 'High' && cfg.countries.includes(e.country));
  // Manual list: a bad date in config must not take the engine down — it is skipped.
  const manual: { title: string; at: number }[] = cfg.manualEvents
    .map((m) => ({ title: m.title, at: Date.parse(m.at) }))
    .filter((m) => Number.isFinite(m.at));
  const all = [...fromFeed.map((e) => ({ title: e.title, at: Date.parse(e.at) })), ...manual];
  for (const e of all) {
    if (!Number.isFinite(e.at)) continue;
    if (t >= e.at - before && t <= e.at + after) {
      const mins = Math.round((e.at - t) / 60_000);
      const when = mins > 0 ? `in ${mins} min` : mins === 0 ? 'now' : `${-mins} min ago`;
      return { passed: false, detail: `News blackout: ${e.title} ${when}.` };
    }
  }
  if (!calendarAvailable) {
    if (manual.length) return { passed: true, detail: 'Calendar feed unavailable — checked the manual event list only.' };
    // Fail closed: an unknown news schedule is not the same as "no news".
    return {
      passed: !cfg.failClosedWhenUnavailable,
      detail: 'Calendar feed unavailable and no manual events configured — news could not be checked. Check Forex Factory before trading.',
    };
  }
  return { passed: true, detail: 'No high-impact print inside the blackout window.' };
}

export function dataAgeMinutes(now: Date, newest: NewestBar | null): number | null {
  if (!newest) return null;
  const closeAt = (newest.time + INTERVAL_SECONDS[newest.interval]) * 1000;
  return Math.max(0, Math.round((now.getTime() - closeAt) / 60_000));
}

export function freshnessGate(now: Date, newest: NewestBar | null): { passed: boolean; detail: string; age: number | null } {
  if (!newest) return { passed: false, detail: 'Data stale: no bars returned.', age: null };
  const age = dataAgeMinutes(now, newest) ?? 0;
  const limit = READINESS_CONFIG.maxDataAgeMinutes[newest.interval];
  if (age > limit) {
    return { passed: false, detail: `Data stale: last ${newest.interval} bar is ${age} min old (limit ${limit}).`, age };
  }
  return { passed: true, detail: `Last ${newest.interval} bar is ${age} min old.`, age };
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * The side the setup leans to. Daily and 4H carry the lean; Weekly alone is
 * never a side (it can only add or remove points once Daily or 4H points
 * somewhere).
 */
export function dominantSide(reads: Record<Timeframe, TrendRead>): Bias {
  const d = reads.Daily.bias;
  const h = reads['4H'].bias;
  if (d === 'range' && h === 'range') return 'range';
  if (d !== 'range' && h !== 'range' && d !== h) {
    // Daily vs 4H disagree: Weekly breaks the tie, otherwise Daily wins.
    const w = reads.Weekly.bias;
    return w === d || w === h ? w : d;
  }
  return d !== 'range' ? d : h;
}

function word(b: Bias): string {
  return b === 'up' ? 'bullish' : b === 'down' ? 'bearish' : 'range';
}

/**
 * Signed distance from equilibrium in ATR units, positive when price sits on
 * the correct side for the given bias (discount for longs, premium for shorts).
 */
function zoneDistanceAtr(price: number | null, eq: number | null, atrValue: number | null, side: Bias): number | null {
  if (price == null || eq == null || atrValue == null || atrValue <= 0 || side === 'range') return null;
  const raw = (eq - price) / atrValue;
  return side === 'up' ? raw : -raw;
}

function zoneComponent(
  key: string,
  tfLabel: string,
  max: number,
  dist: number | null,
  side: Bias,
): ReadinessComponent {
  const band = READINESS_CONFIG.zoneBandAtr;
  const want = side === 'up' ? 'discount' : 'premium';
  const avoid = side === 'up' ? 'premium' : 'discount';
  if (side === 'range') {
    return { key, label: `${tfLabel} zone not scored — no Daily / 4H lean`, points: 0, max, state: 'failed' };
  }
  if (dist == null) {
    return { key, label: `${tfLabel} zone unknown (no equilibrium or no ATR)`, points: 0, max, state: 'failed' };
  }
  if (dist >= band) {
    return {
      key,
      label: `${tfLabel} in ${want} (${dist.toFixed(1)} ATR ${side === 'up' ? 'below' : 'above'} EQ) — confirm on TradingView`,
      points: max,
      max,
      state: 'passed',
    };
  }
  if (dist > -band) {
    return {
      key,
      label: `${tfLabel} at equilibrium (within ${band} ATR) — confirm on TradingView`,
      points: Math.round(max / 2),
      max,
      state: 'partial',
    };
  }
  return {
    key,
    label: `${tfLabel} in ${avoid} (${(-dist).toFixed(1)} ATR past EQ) — do not chase`,
    points: 0,
    max,
    state: 'failed',
  };
}

export function scoreReadiness(input: ReadinessInput): {
  components: ReadinessComponent[];
  score: number;
  side: 'long' | 'short' | null;
} {
  const W = READINESS_CONFIG.weights;
  const { reads, levels, lastPrice } = input;
  const d = reads.Daily.bias;
  const h = reads['4H'].bias;
  const w = reads.Weekly.bias;
  const side = dominantSide(reads);
  const comps: ReadinessComponent[] = [];

  comps.push({
    key: 'daily',
    label: d === 'range' ? `Daily is range (${reads.Daily.reason})` : `Daily ${word(d)} (HH/HL structure)`,
    points: d === 'range' ? 0 : W.dailyDirectional,
    max: W.dailyDirectional,
    state: d === 'range' ? 'failed' : 'passed',
  });
  comps.push({
    key: 'fourH',
    label: h === 'range' ? `4H is range (${reads['4H'].reason})` : `4H ${word(h)}`,
    points: h === 'range' ? 0 : W.fourHDirectional,
    max: W.fourHDirectional,
    state: h === 'range' ? 'failed' : 'passed',
  });
  const aligned = d !== 'range' && d === h;
  comps.push({
    key: 'dailyFourH',
    label: aligned ? `Daily and 4H aligned ${word(d)}` : `Daily (${d}) and 4H (${h}) not aligned`,
    points: aligned ? W.dailyFourHAligned : 0,
    max: W.dailyFourHAligned,
    state: aligned ? 'passed' : 'failed',
  });
  const weeklyAgrees = side !== 'range' && w === side;
  comps.push({
    key: 'weekly',
    label: weeklyAgrees
      ? `Weekly agrees (${word(w)})`
      : w === 'range'
      ? 'Weekly is range (bonus not earned)'
      : `Weekly ${word(w)} against the ${word(side)} lean`,
    points: weeklyAgrees ? W.weeklyAgrees : 0,
    max: W.weeklyAgrees,
    state: weeklyAgrees ? 'passed' : 'failed',
  });
  const opposite: Bias = side === 'up' ? 'down' : side === 'down' ? 'up' : 'range';
  const conflict = side !== 'range' && [w, d, h].includes(opposite);
  comps.push({
    key: 'conflict',
    label: side === 'range'
      ? 'No dominant side (all timeframes range)'
      : conflict
      ? `Timeframe conflict: one timeframe is ${word(opposite)} against the ${word(side)} lean`
      : 'No timeframe fights the lean',
    points: !conflict && side !== 'range' ? W.noConflict : 0,
    max: W.noConflict,
    state: !conflict && side !== 'range' ? 'passed' : 'failed',
  });

  const dailyAtr = atr(input.dailyCandles, 14);
  const fourHAtr = atr(input.fourHCandles, 14);

  // Structure broken: price has already traded through the daily invalidation
  // (below the last swing low for longs, above the last swing high for shorts).
  // That is not "deep discount" — it is a failed structure and scores nothing on
  // zone or invalidation.
  const inv = levels.Daily.invalidation;
  const broken =
    inv != null && lastPrice != null && side !== 'range' && (side === 'up' ? lastPrice < inv : lastPrice > inv);

  if (broken) {
    const brokenLabel = `Price is through the daily invalidation ${inv!.toFixed(2)} — structure broken, do not ${side === 'up' ? 'buy' : 'sell'} it`;
    comps.push({ key: 'dailyZone', label: brokenLabel, points: 0, max: W.dailyZone, state: 'failed' });
    comps.push({ key: 'fourHZone', label: '4H zone not scored while daily structure is broken', points: 0, max: W.fourHZone, state: 'failed' });
  } else {
    comps.push(zoneComponent('dailyZone', 'Daily', W.dailyZone, zoneDistanceAtr(lastPrice, levels.Daily.equilibrium, dailyAtr, side), side));
    comps.push(zoneComponent('fourHZone', '4H', W.fourHZone, zoneDistanceAtr(lastPrice, levels['4H'].equilibrium, fourHAtr, side), side));
  }

  if (broken) {
    comps.push({ key: 'invalidation', label: 'Invalidation already hit', points: 0, max: W.invalidation, state: 'failed' });
  } else if (inv == null || lastPrice == null || side === 'range') {
    comps.push({ key: 'invalidation', label: 'No daily invalidation level', points: 0, max: W.invalidation, state: 'failed' });
  } else {
    const distAtr = dailyAtr && dailyAtr > 0 ? Math.abs(lastPrice - inv) / dailyAtr : null;
    const wide = distAtr != null && distAtr > READINESS_CONFIG.maxStopAtr;
    comps.push({
      key: 'invalidation',
      label: wide
        ? `Invalidation ${inv.toFixed(2)} is ${distAtr!.toFixed(1)} ATR away (wide stop)`
        : `Invalidation defined at ${inv.toFixed(2)}${distAtr != null ? ` (${distAtr.toFixed(1)} ATR)` : ''}`,
      points: wide ? Math.round(W.invalidation / 2) : W.invalidation,
      max: W.invalidation,
      state: wide ? 'partial' : 'passed',
    });
  }

  const thin = Object.values(reads).some((r) => r.reason === 'not enough confirmed swings');
  comps.push({
    key: 'swingDepth',
    label: thin ? 'Thin swing history on at least one timeframe' : 'Enough confirmed swings on every timeframe',
    points: thin ? 0 : W.swingDepth,
    max: W.swingDepth,
    state: thin ? 'failed' : 'passed',
  });

  const rr = input.swingSetup.status === 'none' || broken ? null : input.swingSetup.rToTp1;
  const rrPts = rr == null ? 0 : rr >= 1 ? W.rewardToTp1 : rr >= 0.5 ? Math.round(W.rewardToTp1 / 2) : 0;
  comps.push({
    key: 'rr',
    label: rr == null
      ? broken
        ? 'No swing map while structure is broken'
        : 'No swing map (structure disagrees)'
      : rr >= 1
      ? `Swing map pays ${rr}R to TP1 at the planned entry`
      : `Swing map pays only ${rr}R to TP1 at the planned entry`,
    points: rrPts,
    max: W.rewardToTp1,
    state: rrPts === W.rewardToTp1 ? 'passed' : rrPts > 0 ? 'partial' : 'failed',
  });

  const score = Math.max(0, Math.min(100, comps.reduce((s, c) => s + c.points, 0)));
  return { components: comps, score, side: side === 'up' ? 'long' : side === 'down' ? 'short' : null };
}

export function gradeFor(score: number): Grade {
  if (score >= READINESS_CONFIG.grades.A) return 'A';
  if (score >= READINESS_CONFIG.grades.B) return 'B';
  return 'C';
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const session = sessionGate(input.now);
  const news = newsGate(input.now, input.events, input.calendarAvailable ?? true);
  const fresh = freshnessGate(input.now, input.newestBar);
  const gates = [
    { name: 'Session window', ...session },
    { name: 'News blackout', ...news },
    { name: 'Data freshness', ...fresh },
  ].map(({ name, passed, detail }) => ({ name, passed, detail }));
  const blocking = gates.find((g) => !g.passed);

  const { components, score, side } = scoreReadiness(input);
  const grade = gradeFor(score);
  const status: ReadinessStatus = blocking ? 'WAIT' : grade === 'A' ? 'READY' : grade === 'B' ? 'WATCH' : 'WAIT';

  const passed = components.filter((c) => c.state === 'passed').map((c) => c.label);
  const failed = components
    .filter((c) => c.state !== 'passed')
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .map((c) => c.label);

  const sideWord = side === 'long' ? 'long' : side === 'short' ? 'short' : 'no side';
  const headline = blocking
    ? `${blocking.name}: ${blocking.detail}`
    : status === 'READY'
    ? `Grade A (${score}). Structure favors a ${sideWord} — confirm on TradingView before acting.`
    : status === 'WATCH'
    ? `Grade B (${score}). ${sideWord === 'no side' ? 'Setup forming' : `${sideWord.toUpperCase()} setup forming`} — ${failed[0] ?? 'confirm manually'}.`
    : `Grade C (${score}). ${failed.slice(0, 2).join('; ') || 'Not enough structure'}.`;

  return {
    symbol: input.symbol,
    status,
    grade,
    score,
    blocking_gate: blocking ? `${blocking.name}: ${blocking.detail}` : null,
    passed,
    failed,
    data_age_minutes: fresh.age,
    updated_at: input.now.toISOString(),
    side,
    headline,
    components,
    gates,
  };
}
