/**
 * Market structure engine — objective, configurable definitions.
 *
 * Every signal has an explicit rule (see STRUCTURE_DEFINITIONS, which the UI
 * prints). Nothing here is a prediction; it labels what the bars already did.
 *
 *  Swing high/low  Fractal pivot: the bar's high (low) is strictly above (below)
 *                  the `strength` bars on each side. A pivot is only KNOWN
 *                  `strength` bars after it prints — events use that delay, so
 *                  there is no lookahead.
 *  Internal vs     Internal structure uses a small strength (default 2),
 *  external        external (swing) structure a larger one (default 5).
 *  HH / LH / HL / LL  Each swing compared with the previous swing of the same kind.
 *  BOS             Price breaks the most recent confirmed swing in the direction
 *                  of the current trend. Confirmation = a candle CLOSE beyond the
 *                  level (default) or any WICK beyond it (configurable).
 *  CHOCH           The first break of the most recent confirmed swing AGAINST the
 *                  current trend (same confirmation rule). It flips the trend.
 *  Consolidation   No BOS / CHOCH within the last `rangeLookback` bars, or no
 *                  break at all yet.
 *  Bullish FVG     Three bars i-1, i, i+1 with low[i+1] > high[i-1]. Gap =
 *                  (high[i-1], low[i+1]). Bearish mirror: high[i+1] < low[i-1].
 *                  Must be ≥ fvgMinAtr × ATR14 to count.
 *  FVG states      unmitigated → partially mitigated (a later wick enters the gap)
 *                  → mitigated (a later bar trades through the whole gap).
 *                  Invalidated = a later CLOSE beyond the far edge.
 *  Equal highs/lows  Two swing pivots within equalTolAtr × ATR14 of each other and
 *                  not yet traded through.
 *  Liquidity sweep A bar trades beyond a liquidity level by at least one tick-ish
 *                  amount and CLOSES back on the original side of it.
 */
import { atr, type Candle } from './indicators';

export interface StructureConfig {
  internalStrength: number;
  externalStrength: number;
  confirmation: 'close' | 'wick';
  fvgMinAtr: number;
  equalTolAtr: number;
  rangeLookback: number;
  /** Drop the last bar when it has not closed yet (avoids repainting). */
  dropForming: boolean;
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  internalStrength: 2,
  externalStrength: 5,
  confirmation: 'close',
  fvgMinAtr: 0.1,
  equalTolAtr: 0.1,
  rangeLookback: 30,
  dropForming: true,
};

export const STRUCTURE_DEFINITIONS: Record<string, string> = {
  swing: 'Swing high/low: fractal pivot — strictly higher (lower) than N bars on each side; known only N bars later.',
  bos: 'BOS: candle close (or wick, if set) beyond the latest confirmed swing in the trend direction.',
  choch: 'CHOCH: first break of the latest confirmed swing against the trend; flips the trend.',
  range: 'Consolidation: no BOS/CHOCH within the lookback window.',
  fvg: 'FVG: 3-bar gap between bar 1 and bar 3 wicks, at least the minimum ATR fraction wide.',
  mitigation: 'Mitigated: a later bar trades through the whole gap. Partial: a later wick enters it. Invalidated: a later close beyond the far edge.',
  equal: 'Equal highs/lows: two swings within the tolerance (ATR fraction) and not yet traded through.',
  sweep: 'Sweep: a bar trades beyond a level and closes back on the original side.',
};

export type Trend = 'bullish' | 'bearish' | 'range';
export type SwingLabel = 'HH' | 'LH' | 'HL' | 'LL' | null;

export interface Swing {
  kind: 'high' | 'low';
  index: number;
  time: number;
  price: number;
  /** Bar index at which this pivot became known. */
  confirmedAt: number;
  label: SwingLabel;
}

export interface StructureEvent {
  type: 'BOS' | 'CHOCH';
  direction: 'bullish' | 'bearish';
  index: number;
  time: number;
  level: number;
  brokenSwingIndex: number;
}

export type FvgState = 'unmitigated' | 'partial' | 'mitigated' | 'invalidated';

export interface Fvg {
  direction: 'bullish' | 'bearish';
  /** Index of the middle bar. */
  index: number;
  time: number;
  top: number;
  bottom: number;
  size: number;
  state: FvgState;
  /** Bar index the state last changed. */
  stateAt: number | null;
  alignedWithTrend: boolean;
}

export interface TimeframeStructure {
  bars: number;
  lastClose: number | null;
  lastTime: number | null;
  atr: number | null;
  trend: Trend;
  /** Trend from the larger (external) swings. */
  externalTrend: Trend;
  swings: Swing[];
  externalSwings: Swing[];
  events: StructureEvent[];
  lastEvent: StructureEvent | null;
  fvgs: Fvg[];
  equalHighs: { price: number; indices: [number, number] }[];
  equalLows: { price: number; indices: [number, number] }[];
  notes: string[];
}

// ─── Swings ─────────────────────────────────────────────────────────────────

export function findSwings(candles: Candle[], strength: number): Swing[] {
  const out: Swing[] = [];
  const n = candles.length;
  let prevHigh: number | null = null;
  let prevLow: number | null = null;
  for (let i = strength; i < n - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) {
      const label: SwingLabel = prevHigh == null ? null : candles[i].high > prevHigh ? 'HH' : 'LH';
      out.push({ kind: 'high', index: i, time: candles[i].time, price: candles[i].high, confirmedAt: i + strength, label });
      prevHigh = candles[i].high;
    }
    if (isLow) {
      const label: SwingLabel = prevLow == null ? null : candles[i].low > prevLow ? 'HL' : 'LL';
      out.push({ kind: 'low', index: i, time: candles[i].time, price: candles[i].low, confirmedAt: i + strength, label });
      prevLow = candles[i].low;
    }
  }
  return out;
}

// ─── BOS / CHOCH ────────────────────────────────────────────────────────────

/**
 * Walk forward bar by bar. At bar j only swings with confirmedAt ≤ j are
 * visible. The latest visible unbroken swing high / low are the levels.
 */
export function structureEvents(candles: Candle[], swings: Swing[], confirmation: 'close' | 'wick'): { events: StructureEvent[]; trend: Trend } {
  const events: StructureEvent[] = [];
  let trend: Trend = 'range';
  let activeHigh: Swing | null = null;
  let activeLow: Swing | null = null;
  const byConfirm = [...swings].sort((a, b) => a.confirmedAt - b.confirmedAt || a.index - b.index);
  let k = 0;
  for (let j = 0; j < candles.length; j++) {
    while (k < byConfirm.length && byConfirm[k].confirmedAt <= j) {
      const s = byConfirm[k++];
      if (s.kind === 'high') activeHigh = s;
      else activeLow = s;
    }
    const c = candles[j];
    const upPx = confirmation === 'close' ? c.close : c.high;
    const dnPx = confirmation === 'close' ? c.close : c.low;
    if (activeHigh && j > activeHigh.index && upPx > activeHigh.price) {
      events.push({ type: trend === 'bearish' ? 'CHOCH' : 'BOS', direction: 'bullish', index: j, time: c.time, level: activeHigh.price, brokenSwingIndex: activeHigh.index });
      trend = 'bullish';
      activeHigh = null;
    }
    if (activeLow && j > activeLow.index && dnPx < activeLow.price) {
      events.push({ type: trend === 'bullish' ? 'CHOCH' : 'BOS', direction: 'bearish', index: j, time: c.time, level: activeLow.price, brokenSwingIndex: activeLow.index });
      trend = 'bearish';
      activeLow = null;
    }
  }
  return { events, trend };
}

// ─── FVG ────────────────────────────────────────────────────────────────────

export function findFvgs(candles: Candle[], minSize: number, trend: Trend): Fvg[] {
  const out: Fvg[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const a = candles[i - 1];
    const c = candles[i + 1];
    let fvg: Fvg | null = null;
    if (c.low > a.high && c.low - a.high >= minSize) {
      fvg = { direction: 'bullish', index: i, time: candles[i].time, top: c.low, bottom: a.high, size: c.low - a.high, state: 'unmitigated', stateAt: null, alignedWithTrend: trend === 'bullish' };
    } else if (c.high < a.low && a.low - c.high >= minSize) {
      fvg = { direction: 'bearish', index: i, time: candles[i].time, top: a.low, bottom: c.high, size: a.low - c.high, state: 'unmitigated', stateAt: null, alignedWithTrend: trend === 'bearish' };
    }
    if (!fvg) continue;
    for (let j = i + 2; j < candles.length && fvg.state !== 'invalidated' && fvg.state !== 'mitigated'; j++) {
      const b = candles[j];
      if (fvg.direction === 'bullish') {
        if (b.close < fvg.bottom) { fvg.state = 'invalidated'; fvg.stateAt = j; }
        else if (b.low <= fvg.bottom) { fvg.state = 'mitigated'; fvg.stateAt = j; }
        else if (b.low < fvg.top && fvg.state === 'unmitigated') { fvg.state = 'partial'; fvg.stateAt = j; }
      } else {
        if (b.close > fvg.top) { fvg.state = 'invalidated'; fvg.stateAt = j; }
        else if (b.high >= fvg.top) { fvg.state = 'mitigated'; fvg.stateAt = j; }
        else if (b.high > fvg.bottom && fvg.state === 'unmitigated') { fvg.state = 'partial'; fvg.stateAt = j; }
      }
    }
    out.push(fvg);
  }
  return out;
}

// ─── Equal highs / lows ─────────────────────────────────────────────────────

export function equalLevels(candles: Candle[], swings: Swing[], tol: number): { highs: TimeframeStructure['equalHighs']; lows: TimeframeStructure['equalLows'] } {
  const highs: TimeframeStructure['equalHighs'] = [];
  const lows: TimeframeStructure['equalLows'] = [];
  const hs = swings.filter((s) => s.kind === 'high');
  const ls = swings.filter((s) => s.kind === 'low');
  const untaken = (from: number, test: (c: Candle) => boolean) => !candles.slice(from + 1).some(test);
  for (let i = 1; i < hs.length; i++) {
    const a = hs[i - 1], b = hs[i];
    if (Math.abs(a.price - b.price) <= tol) {
      const lvl = Math.max(a.price, b.price);
      if (untaken(b.index, (c) => c.high > lvl)) highs.push({ price: lvl, indices: [a.index, b.index] });
    }
  }
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    if (Math.abs(a.price - b.price) <= tol) {
      const lvl = Math.min(a.price, b.price);
      if (untaken(b.index, (c) => c.low < lvl)) lows.push({ price: lvl, indices: [a.index, b.index] });
    }
  }
  return { highs, lows };
}

// ─── Forming bar ────────────────────────────────────────────────────────────

/** Remove the last bar if it has not closed yet at `now`. */
export function dropFormingBar<T extends Candle>(candles: T[], intervalSec: number, now: Date): T[] {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return now.getTime() / 1000 < last.time + intervalSec ? candles.slice(0, -1) : candles;
}

// ─── One timeframe ──────────────────────────────────────────────────────────

export function analyzeStructure(candles: Candle[], cfg: StructureConfig = DEFAULT_STRUCTURE_CONFIG): TimeframeStructure {
  const notes: string[] = [];
  const a = atr(candles, 14);
  const swings = findSwings(candles, cfg.internalStrength);
  const externalSwings = findSwings(candles, cfg.externalStrength);
  const internal = structureEvents(candles, swings, cfg.confirmation);
  const external = structureEvents(candles, externalSwings, cfg.confirmation);
  const lastEvent = internal.events[internal.events.length - 1] ?? null;
  let trend = internal.trend;
  if (!lastEvent || candles.length - 1 - lastEvent.index > cfg.rangeLookback) {
    trend = 'range';
    notes.push(lastEvent ? `No break in the last ${cfg.rangeLookback} bars — consolidation.` : 'No structure break yet.');
  }
  const fvgs = a ? findFvgs(candles, cfg.fvgMinAtr * a, trend) : [];
  if (!a) notes.push('Not enough bars for ATR14 — FVGs and equal levels skipped.');
  const eq = a ? equalLevels(candles, swings, cfg.equalTolAtr * a) : { highs: [], lows: [] };
  return {
    bars: candles.length,
    lastClose: candles.length ? candles[candles.length - 1].close : null,
    lastTime: candles.length ? candles[candles.length - 1].time : null,
    atr: a,
    trend,
    externalTrend: external.trend,
    swings,
    externalSwings,
    events: internal.events,
    lastEvent,
    fvgs,
    equalHighs: eq.highs,
    equalLows: eq.lows,
    notes,
  };
}

// ─── Session-aware resampling and liquidity ─────────────────────────────────

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

/** New York calendar date + minute of day for a unix-second timestamp (DST-correct). */
export function etStamp(sec: number): { ymd: string; mins: number } {
  const p = Object.fromEntries(ET_FMT.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** CME session date (18:00 ET starts the next date) and minutes since 18:00 ET. */
export function sessionStamp(sec: number): { session: string; minsFromOpen: number; etMins: number } {
  const { ymd, mins } = etStamp(sec);
  if (mins >= 18 * 60) return { session: addDays(ymd, 1), minsFromOpen: mins - 18 * 60, etMins: mins };
  return { session: ymd, minsFromOpen: mins + 6 * 60, etMins: mins };
}

/**
 * Resample intraday bars into N-hour buckets anchored at the 18:00 ET CME
 * open (so 4H = 18–22, 22–02, 02–06, 06–10, 10–14, 14–17). Stays aligned
 * through daylight-saving changes, unlike epoch-based buckets.
 */
export function resampleSessionHours(bars: Candle[], hours: number): Candle[] {
  const out: Candle[] = [];
  let key = '';
  for (const b of bars) {
    const s = sessionStamp(b.time);
    const k = `${s.session}#${Math.floor(s.minsFromOpen / (hours * 60))}`;
    const cur = out[out.length - 1];
    if (k !== key || !cur) {
      out.push({ ...b });
      key = k;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  return out;
}

export interface SessionWindow {
  name: string;
  /** ET minutes; start > end wraps midnight. */
  start: number;
  end: number;
}

/** Same windows as the Globex clock (lib/powerHour.ts SESSION_HOURS). */
export const SESSION_WINDOWS: SessionWindow[] = [
  { name: 'Asia', start: 18 * 60, end: 4 * 60 },
  { name: 'London', start: 3 * 60, end: 12 * 60 },
  { name: 'New York', start: 8 * 60, end: 17 * 60 },
];

function inWin(m: number, w: { start: number; end: number }): boolean {
  return w.start < w.end ? m >= w.start && m < w.end : m >= w.start || m < w.end;
}

export interface LiquidityLevel {
  name: string;
  price: number;
  side: 'high' | 'low';
  /** A later bar has already traded through it. */
  taken: boolean;
  /** A later bar swept it (wick through, close back inside). */
  swept: boolean;
  sweptAt: number | null;
}

export interface Liquidity {
  session: string | null;
  levels: LiquidityLevel[];
  sweeps: { name: string; side: 'high' | 'low'; price: number; time: number }[];
  notes: string[];
}

/**
 * Liquidity map from intraday bars (5m or 15m). Previous day/week use CME
 * session dates; overnight = 18:00 → 09:30 ET of the current session; Asia /
 * London / New York use SESSION_WINDOWS within the current session.
 */
export function liquidityMap(bars: Candle[], windows: SessionWindow[] = SESSION_WINDOWS): Liquidity {
  const notes: string[] = [];
  if (!bars.length) return { session: null, levels: [], sweeps: [], notes: ['No intraday bars.'] };
  const stamped = bars.map((b) => ({ b, s: sessionStamp(b.time) }));
  const sessions = Array.from(new Set(stamped.map((x) => x.s.session))).sort();
  const current = sessions[sessions.length - 1];
  const prev = sessions[sessions.length - 2] ?? null;

  const levels: { name: string; price: number; side: 'high' | 'low'; fromIdx: number }[] = [];
  const hiLo = (rows: typeof stamped) => rows.length ? { hi: Math.max(...rows.map((r) => r.b.high)), lo: Math.min(...rows.map((r) => r.b.low)), last: stamped.indexOf(rows[rows.length - 1]) } : null;

  if (prev) {
    const p = hiLo(stamped.filter((x) => x.s.session === prev));
    if (p) levels.push({ name: 'Previous day high', price: p.hi, side: 'high', fromIdx: p.last }, { name: 'Previous day low', price: p.lo, side: 'low', fromIdx: p.last });
  } else notes.push('Only one session of bars — no previous-day levels.');

  // Previous ISO week (Monday-start) of session dates.
  const weekOf = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    return addDays(ymd, -dow);
  };
  const curWeek = weekOf(current);
  const prevWeekRows = stamped.filter((x) => weekOf(x.s.session) < curWeek);
  const lastPrevWeek = prevWeekRows.length ? weekOf(prevWeekRows[prevWeekRows.length - 1].s.session) : null;
  if (lastPrevWeek) {
    const rows = prevWeekRows.filter((x) => weekOf(x.s.session) === lastPrevWeek);
    const w = hiLo(rows);
    const complete = new Set(rows.map((r) => r.s.session)).size >= 4;
    if (w && complete) levels.push({ name: 'Previous week high', price: w.hi, side: 'high', fromIdx: w.last }, { name: 'Previous week low', price: w.lo, side: 'low', fromIdx: w.last });
    else notes.push('Previous week is incomplete in the fetched bars — weekly levels skipped.');
  } else notes.push('No previous-week bars fetched.');

  const cur = stamped.filter((x) => x.s.session === current);
  const on = hiLo(cur.filter((x) => x.s.minsFromOpen < 15 * 60 + 30)); // 18:00 → 09:30
  if (on) levels.push({ name: 'Overnight high', price: on.hi, side: 'high', fromIdx: on.last }, { name: 'Overnight low', price: on.lo, side: 'low', fromIdx: on.last });
  for (const w of windows) {
    const r = hiLo(cur.filter((x) => inWin(x.s.etMins, w)));
    if (r) levels.push({ name: `${w.name} high`, price: r.hi, side: 'high', fromIdx: r.last }, { name: `${w.name} low`, price: r.lo, side: 'low', fromIdx: r.last });
  }

  const sweeps: Liquidity['sweeps'] = [];
  const out: LiquidityLevel[] = levels.map((l) => {
    let taken = false, swept = false, sweptAt: number | null = null;
    for (let j = l.fromIdx + 1; j < bars.length; j++) {
      const b = bars[j];
      if (l.side === 'high' && b.high > l.price) {
        taken = true;
        if (b.close < l.price && !swept) { swept = true; sweptAt = b.time; sweeps.push({ name: l.name, side: 'high', price: l.price, time: b.time }); }
      }
      if (l.side === 'low' && b.low < l.price) {
        taken = true;
        if (b.close > l.price && !swept) { swept = true; sweptAt = b.time; sweeps.push({ name: l.name, side: 'low', price: l.price, time: b.time }); }
      }
    }
    return { name: l.name, price: l.price, side: l.side, taken, swept, sweptAt };
  });
  return { session: current, levels: out, sweeps, notes };
}

// ─── Multi-timeframe consolidation ──────────────────────────────────────────

export type TfKey = '1D' | '4H' | '1H' | '15m' | '5m' | '1m';
export const TF_WEIGHTS: Record<TfKey, number> = { '1D': 3, '4H': 2.5, '1H': 2, '15m': 1.5, '5m': 1, '1m': 0.5 };

export interface MtfAssessment {
  bias: Trend;
  /** −1 … +1: weighted share of bullish minus bearish timeframes. */
  score: number;
  htf: Trend;
  ltf: Trend;
  conflicts: string[];
  summary: string;
}

export function consolidate(reads: Partial<Record<TfKey, Trend | null>>): MtfAssessment {
  let total = 0, sum = 0;
  const avail = (Object.keys(TF_WEIGHTS) as TfKey[]).filter((k) => reads[k] != null);
  for (const k of avail) {
    total += TF_WEIGHTS[k];
    sum += reads[k] === 'bullish' ? TF_WEIGHTS[k] : reads[k] === 'bearish' ? -TF_WEIGHTS[k] : 0;
  }
  const score = total ? Math.round((sum / total) * 100) / 100 : 0;
  const group = (keys: TfKey[]): Trend => {
    const v = keys.map((k) => reads[k]).filter((x): x is Trend => x != null);
    const b = v.filter((x) => x === 'bullish').length, s = v.filter((x) => x === 'bearish').length;
    return b > s ? 'bullish' : s > b ? 'bearish' : 'range';
  };
  const htf = group(['1D', '4H', '1H']);
  const ltf = group(['15m', '5m', '1m']);
  const bias: Trend = score >= 0.35 ? 'bullish' : score <= -0.35 ? 'bearish' : 'range';
  const conflicts: string[] = [];
  const bulls = avail.filter((k) => reads[k] === 'bullish');
  const bears = avail.filter((k) => reads[k] === 'bearish');
  if (bulls.length && bears.length) conflicts.push(`Bullish: ${bulls.join(', ')} · Bearish: ${bears.join(', ')}`);
  if (htf !== 'range' && ltf !== 'range' && htf !== ltf) conflicts.push(`Higher timeframes are ${htf} while lower timeframes are ${ltf} — a pullback or a possible turn, not a confirmed reversal.`);
  const missing = (Object.keys(TF_WEIGHTS) as TfKey[]).filter((k) => reads[k] == null);
  const summary =
    (bias === 'range' ? 'No clear overall direction' : `Leaning ${bias}`) +
    ` (weighted ${score >= 0 ? '+' : ''}${score}). HTF ${htf}, LTF ${ltf}.` +
    (missing.length ? ` Missing: ${missing.join(', ')}.` : '');
  return { bias, score, htf, ltf, conflicts, summary };
}
