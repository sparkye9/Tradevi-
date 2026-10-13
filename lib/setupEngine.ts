/**
 * Explainable setup generator.
 *
 * Builds candidate trades from the structure engine. Three setup types, each
 * with a written rule (SETUP_RULES). Every candidate carries the factor table
 * that produced its score; the score is a checklist total, NOT a probability
 * of success — it has not been validated against outcomes.
 *
 * A setup can only reach CONFIRMED when the 15m and 5m data are present and
 * fresh. Missing or stale data caps it at WATCHING with the reason shown.
 */
import type { TimeframeStructure, Liquidity, Trend, Fvg, TfKey } from './structure';
import type { MarketClock } from './powerHour';
import type { CalendarEvent } from './economicCalendar';
import { contractSpec, roundToTick } from './contracts';
import type { Candle } from './indicators';

export type SetupType = 'Pullback' | 'Breakout' | 'Liquidity sweep' | 'Reversal';
export type SetupStatus = 'Watching' | 'Confirmed' | 'Invalidated' | 'Expired';

export const SETUP_RULES: Record<SetupType, string> = {
  Pullback: 'Higher-timeframe bias (1D/4H/1H) is directional; price pulls back into an unfilled 15m FVG in that direction. Confirmed by a 5m BOS/CHOCH in the trade direction after price touches the zone.',
  Breakout: 'A 15m BOS in the higher-timeframe direction within the last 8 bars; entry is a retest of the broken level (±0.25 × 15m ATR). Confirmed when a 15m bar retests the zone and closes back beyond the level.',
  'Liquidity sweep': 'A 15m bar sweeps a liquidity level (wick through, close back) within the last 12 bars, in the direction of the higher timeframe. Confirmed by a 5m CHOCH/BOS away from the sweep.',
  Reversal: 'Same as a liquidity sweep but AGAINST the higher-timeframe bias — counter-trend, scored lower.',
};

export const SCORE_WEIGHTS = {
  htfAlignment: 25,
  structure: 15,
  liquidityTarget: 15,
  volatility: 10,
  room: 10,
  session: 10,
  news: 10,
  rewardRisk: 5,
} as const;

export interface ScoreFactor {
  key: keyof typeof SCORE_WEIGHTS;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface SetupCandidate {
  id: string;
  instrument: string;
  type: SetupType;
  bias: 'Bullish' | 'Bearish';
  direction: 'long' | 'short';
  entryZone: [number, number];
  invalidation: number;
  stop: number;
  tp1: number | null;
  tp1Name: string | null;
  tp2: number | null;
  tp2Name: string | null;
  rr: number | null;
  confirmation: string[];
  status: SetupStatus;
  statusReason: string;
  score: number;
  factors: ScoreFactor[];
  rule: string;
  dataOk: boolean;
  createdAt: string | null;
}

export interface SetupInputs {
  instrument: string;
  now: Date;
  tf: Partial<Record<TfKey, TimeframeStructure>>;
  bars15m: Candle[];
  bars5m: Candle[];
  liquidity: Liquidity | null;
  htfBias: Trend;
  /** Fresh = newest bar within the freshness limit. */
  fresh: Partial<Record<TfKey, boolean>>;
  clock: MarketClock;
  events: CalendarEvent[];
  calendarAvailable: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

interface Target { name: string; price: number }

function targetsFor(dir: 'long' | 'short', price: number, inp: SetupInputs): Target[] {
  const out: Target[] = [];
  for (const l of inp.liquidity?.levels ?? []) if (!l.taken) out.push({ name: l.name, price: l.price });
  const s15 = inp.tf['15m'];
  for (const e of s15?.equalHighs ?? []) out.push({ name: '15m equal highs', price: e.price });
  for (const e of s15?.equalLows ?? []) out.push({ name: '15m equal lows', price: e.price });
  const sw = s15?.swings ?? [];
  const lastH = [...sw].reverse().find((s) => s.kind === 'high');
  const lastL = [...sw].reverse().find((s) => s.kind === 'low');
  if (lastH) out.push({ name: '15m swing high', price: lastH.price });
  if (lastL) out.push({ name: '15m swing low', price: lastL.price });
  const side = out.filter((t) => (dir === 'long' ? t.price > price : t.price < price));
  side.sort((a, b) => (dir === 'long' ? a.price - b.price : b.price - a.price));
  // De-duplicate levels within a hair of each other.
  const dedup: Target[] = [];
  for (const t of side) if (!dedup.some((d) => Math.abs(d.price - t.price) < 1e-6 * t.price + 1e-9)) dedup.push(t);
  return dedup;
}

function medianAtrRatio(bars: Candle[], atrNow: number | null): number | null {
  if (!atrNow || bars.length < 30) return null;
  const ranges = bars.slice(-100).map((b) => b.high - b.low).sort((a, b) => a - b);
  const med = ranges[Math.floor(ranges.length / 2)];
  return med > 0 ? atrNow / med : null;
}

function score(dir: 'long' | 'short', type: SetupType, rr: number | null, tp1: Target | null, inp: SetupInputs): ScoreFactor[] {
  const want: Trend = dir === 'long' ? 'bullish' : 'bearish';
  const opp: Trend = dir === 'long' ? 'bearish' : 'bullish';
  const W = SCORE_WEIGHTS;
  const f: ScoreFactor[] = [];
  const htf = inp.htfBias;
  f.push({ key: 'htfAlignment', label: 'Higher-timeframe alignment', max: W.htfAlignment, points: htf === want ? W.htfAlignment : htf === 'range' ? 10 : 0, detail: `1D/4H/1H consolidated bias is ${htf}.` });
  const t15 = inp.tf['15m']?.trend ?? 'range';
  f.push({ key: 'structure', label: '15m market structure', max: W.structure, points: t15 === want ? W.structure : t15 === 'range' ? 5 : 0, detail: `15m trend is ${t15}${t15 === opp && (type === 'Liquidity sweep' || type === 'Reversal') ? ' (expected for a reversal)' : ''}.` });
  f.push({ key: 'liquidityTarget', label: 'Liquidity target', max: W.liquidityTarget, points: tp1 ? W.liquidityTarget : 0, detail: tp1 ? `Untaken target: ${tp1.name} ${tp1.price}.` : 'No untaken liquidity on the target side.' });
  const ratio = medianAtrRatio(inp.bars15m, inp.tf['15m']?.atr ?? null);
  const volOk = ratio != null && ratio >= 0.6 && ratio <= 1.8;
  f.push({ key: 'volatility', label: 'Volatility', max: W.volatility, points: ratio == null ? 0 : volOk ? W.volatility : 3, detail: ratio == null ? 'Not enough 15m bars.' : `15m ATR is ${r2(ratio)}× the median bar range${volOk ? '' : ' — unusual'}.` });
  f.push({ key: 'room', label: 'Room to opposing level', max: W.room, points: rr != null && rr >= 1 ? W.room : 0, detail: rr == null ? 'No target.' : `${rr}R to the first opposing level.` });
  const sess = inp.clock.venues;
  const sessPts = !inp.clock.tradesOpen ? 0 : sess.includes('New York') || sess.includes('London') ? W.session : 4;
  f.push({ key: 'session', label: 'Session timing', max: W.session, points: sessPts, detail: inp.clock.headline });
  const t = inp.now.getTime();
  const near = inp.events.find((e) => e.impact === 'High' && e.country === 'USD' && Math.abs(Date.parse(e.at) - t) <= 60 * 60_000);
  f.push({ key: 'news', label: 'Economic news', max: W.news, points: !inp.calendarAvailable ? 0 : near ? 0 : W.news, detail: !inp.calendarAvailable ? 'Calendar unavailable — not checked.' : near ? `${near.title} within 60 min.` : 'No high-impact USD print within 60 min.' });
  f.push({ key: 'rewardRisk', label: 'Reward : risk', max: W.rewardRisk, points: rr == null ? 0 : rr >= 2 ? W.rewardRisk : rr >= 1.5 ? 3 : 0, detail: rr == null ? 'n/a' : `${rr}R.` });
  return f;
}

function build(
  inp: SetupInputs, type: SetupType, dir: 'long' | 'short', zone: [number, number], invalidation: number,
  status: SetupStatus, statusReason: string, confirmation: string[], createdAt: number | null,
): SetupCandidate {
  const spec = contractSpec(inp.instrument);
  const tick = spec?.tickSize ?? 0.01;
  const atr15 = inp.tf['15m']?.atr ?? 0;
  const stop = roundToTick(dir === 'long' ? invalidation - 0.1 * atr15 : invalidation + 0.1 * atr15, tick);
  const z: [number, number] = [roundToTick(Math.min(...zone), tick), roundToTick(Math.max(...zone), tick)];
  const mid = (z[0] + z[1]) / 2;
  const tg = targetsFor(dir, dir === 'long' ? z[1] : z[0], inp);
  const tp1 = tg[0] ?? null;
  const tp2 = tg[1] ?? null;
  const risk = Math.abs(mid - stop);
  const rr = tp1 && risk > 0 ? r2(Math.abs(tp1.price - mid) / risk) : null;
  const factors = score(dir, type, rr, tp1, inp);
  const dataOk = Boolean(inp.fresh['15m'] && inp.fresh['5m']);
  let st = status, why = statusReason;
  if (st === 'Confirmed' && !dataOk) { st = 'Watching'; why = 'Would be confirmed, but 15m/5m data is missing or stale — not confirming on unknown data.'; }
  if (st === 'Confirmed' && !tp1) { st = 'Watching'; why = 'Confirmation printed, but there is no target on the trade side.'; }
  return {
    id: `${inp.instrument}-${type}-${dir}-${createdAt ?? 0}`,
    instrument: inp.instrument,
    type,
    bias: dir === 'long' ? 'Bullish' : 'Bearish',
    direction: dir,
    entryZone: z,
    invalidation: r2(invalidation),
    stop,
    tp1: tp1 ? roundToTick(tp1.price, tick) : null,
    tp1Name: tp1?.name ?? null,
    tp2: tp2 ? roundToTick(tp2.price, tick) : null,
    tp2Name: tp2?.name ?? null,
    rr,
    confirmation,
    status: st,
    statusReason: why,
    score: factors.reduce((s, x) => s + x.points, 0),
    factors,
    rule: SETUP_RULES[type],
    dataOk,
    createdAt: createdAt ? new Date(createdAt * 1000).toISOString() : null,
  };
}

const FVG_EXPIRY_BARS = 32; // 8 hours of 15m bars

function pullback(inp: SetupInputs): SetupCandidate[] {
  const s15 = inp.tf['15m'];
  const bars = inp.bars15m;
  if (!s15 || !bars.length || inp.htfBias === 'range') return [];
  const dir: 'long' | 'short' = inp.htfBias === 'bullish' ? 'long' : 'short';
  const last = bars[bars.length - 1];
  const want = dir === 'long' ? 'bullish' : 'bearish';
  const fvg: Fvg | undefined = [...s15.fvgs].reverse().find((g) =>
    g.direction === want && (g.state === 'unmitigated' || g.state === 'partial') &&
    (dir === 'long' ? g.bottom < last.close : g.top > last.close));
  if (!fvg) return [];
  const priorSwing = [...s15.swings].reverse().find((s) => s.kind === (dir === 'long' ? 'low' : 'high') && s.index <= fvg.index && (dir === 'long' ? s.price < fvg.bottom : s.price > fvg.top));
  const invalidation = priorSwing?.price ?? (dir === 'long' ? fvg.bottom : fvg.top);
  const age = bars.length - 1 - fvg.index;
  const touchedIdx = bars.findIndex((b, i) => i > fvg.index + 1 && (dir === 'long' ? b.low <= fvg.top : b.high >= fvg.bottom));
  const brokeInv = bars.slice(fvg.index + 2).some((b) => (dir === 'long' ? b.close < invalidation : b.close > invalidation));
  let status: SetupStatus = 'Watching';
  let why = `Waiting for price to reach the ${want} FVG ${r2(fvg.bottom)}–${r2(fvg.top)}.`;
  if (brokeInv) { status = 'Invalidated'; why = `A 15m close went through the invalidation ${r2(invalidation)}.`; }
  else if (age > FVG_EXPIRY_BARS && touchedIdx < 0) { status = 'Expired'; why = `FVG is ${age} bars old and was never revisited.`; }
  else if (touchedIdx >= 0) {
    const touchTime = bars[touchedIdx].time;
    const ev = inp.tf['5m']?.events.find((e) => e.time > touchTime && e.direction === want);
    if (ev) { status = 'Confirmed'; why = `5m ${ev.type} ${ev.direction} at ${r2(ev.level)} after the zone was touched.`; }
    else why = 'Price reached the zone — waiting for a 5m BOS/CHOCH in the trade direction.';
  }
  return [build(inp, 'Pullback', dir, [fvg.bottom, fvg.top], invalidation, status, why, [
    `Price trades into ${r2(fvg.bottom)}–${r2(fvg.top)}`,
    `5m ${dir === 'long' ? 'bullish' : 'bearish'} BOS or CHOCH after the touch`,
    `No 15m close ${dir === 'long' ? 'below' : 'above'} ${r2(invalidation)}`,
  ], fvg.time)];
}

function breakout(inp: SetupInputs): SetupCandidate[] {
  const s15 = inp.tf['15m'];
  const bars = inp.bars15m;
  if (!s15 || !bars.length || inp.htfBias === 'range' || !s15.atr) return [];
  const want = inp.htfBias;
  const ev = [...s15.events].reverse().find((e) => e.type === 'BOS' && e.direction === want);
  if (!ev || bars.length - 1 - ev.index > 8) return [];
  const dir: 'long' | 'short' = want === 'bullish' ? 'long' : 'short';
  const zone: [number, number] = [ev.level - 0.25 * s15.atr, ev.level + 0.25 * s15.atr];
  const swing = [...s15.swings].reverse().find((s) => s.kind === (dir === 'long' ? 'low' : 'high') && s.index < ev.index);
  if (!swing) return [];
  const after = bars.slice(ev.index + 1);
  const brokeInv = after.some((b) => (dir === 'long' ? b.close < swing.price : b.close > swing.price));
  const retest = after.find((b) => (dir === 'long' ? b.low <= zone[1] && b.close > ev.level : b.high >= zone[0] && b.close < ev.level));
  const status: SetupStatus = brokeInv ? 'Invalidated' : retest ? 'Confirmed' : 'Watching';
  const why = brokeInv ? `15m closed through ${r2(swing.price)}.` : retest ? `15m retested ${r2(ev.level)} and closed back ${dir === 'long' ? 'above' : 'below'}.` : `Waiting for a retest of the broken level ${r2(ev.level)}.`;
  return [build(inp, 'Breakout', dir, zone, swing.price, status, why, [
    `Retest of ${r2(ev.level)} (±0.25 ATR)`,
    `15m close back ${dir === 'long' ? 'above' : 'below'} ${r2(ev.level)}`,
  ], ev.time)];
}

function sweeps(inp: SetupInputs): SetupCandidate[] {
  const bars = inp.bars15m;
  const s15 = inp.tf['15m'];
  if (!inp.liquidity || !bars.length || !s15?.atr) return [];
  const out: SetupCandidate[] = [];
  const recentFrom = bars[Math.max(0, bars.length - 12)].time;
  const sw = inp.liquidity.sweeps.filter((s) => s.time >= recentFrom).slice(-2);
  for (const s of sw) {
    const dir: 'long' | 'short' = s.side === 'low' ? 'long' : 'short';
    const want = dir === 'long' ? 'bullish' : 'bearish';
    const counter = inp.htfBias !== 'range' && inp.htfBias !== want;
    const type: SetupType = counter ? 'Reversal' : 'Liquidity sweep';
    const sweepBar = inp.bars5m.filter((b) => b.time >= s.time - 900 && b.time <= s.time + 900);
    const extreme = sweepBar.length ? (dir === 'long' ? Math.min(...sweepBar.map((b) => b.low)) : Math.max(...sweepBar.map((b) => b.high))) : s.price;
    const zone: [number, number] = dir === 'long' ? [s.price, s.price + 0.5 * s15.atr] : [s.price - 0.5 * s15.atr, s.price];
    const after = bars.filter((b) => b.time > s.time);
    const brokeInv = after.some((b) => (dir === 'long' ? b.close < extreme : b.close > extreme));
    const ev = inp.tf['5m']?.events.find((e) => e.time > s.time && e.direction === want);
    const status: SetupStatus = brokeInv ? 'Invalidated' : ev ? 'Confirmed' : 'Watching';
    const why = brokeInv ? `Price closed beyond the sweep extreme ${r2(extreme)}.` : ev ? `5m ${ev.type} ${want} after the sweep of ${s.name}.` : `${s.name} swept — waiting for a 5m ${want} CHOCH/BOS.`;
    out.push(build(inp, type, dir, zone, extreme, status, why, [
      `${s.name} (${r2(s.price)}) swept and closed back`,
      `5m ${want} CHOCH or BOS after the sweep`,
      `No close beyond the sweep extreme ${r2(extreme)}`,
      ...(counter ? ['Counter-trend: against the higher-timeframe bias'] : []),
    ], s.time));
  }
  return out;
}

export function generateSetups(inp: SetupInputs): SetupCandidate[] {
  return [...pullback(inp), ...breakout(inp), ...sweeps(inp)].sort((a, b) => {
    const rank = (s: SetupCandidate) => (s.status === 'Confirmed' ? 0 : s.status === 'Watching' ? 1 : 2);
    return rank(a) - rank(b) || b.score - a.score;
  });
}
