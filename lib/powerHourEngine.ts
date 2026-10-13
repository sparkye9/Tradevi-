/**
 * Futures Power Hour engine.
 *
 * Default window (your preference, editable): watch for an entry 2:38–2:45 PM
 * ET, plan the exit 3:15–3:20 PM ET. The window arriving is NEVER a reason to
 * trade on its own — every rule below must pass, otherwise the status is
 * NO TRADE and the failing rules are listed.
 *
 * Rules (all must pass for CANDIDATE; CONFIRMED additionally needs the
 * confirmation bar inside the entry window):
 *   1. Session      Cash session open today, not a holiday or early-close day.
 *   2. Data         Newest 5-minute bar is no older than maxDataAgeMin.
 *   3. News         No high-impact USD event from newsBeforeMin before the entry
 *                   window to the end of the exit window.
 *   4. Structure    5-minute trend is bullish or bearish (not consolidation).
 *   5. VWAP         Price is on the same side of RTH VWAP as the 5m trend.
 *   6. HTF          15-minute trend is not opposite to the 5m trend.
 *   7. Volatility   Today's RTH range is between minRangeRatio and
 *                   maxRangeRatio × the average of the prior sessions' RTH ranges.
 *   8. Reward       Distance to the nearest opposing liquidity ≥ minRR × risk
 *                   (risk = entry-zone mid to the invalidation stop).
 *  Entry zone      Long: from the higher of RTH VWAP and the last confirmed 5m
 *                  swing low, up 0.5 × 5m ATR14. Short: mirror. Invalidation =
 *                  that swing; stop = swing ± stopBufferAtr × ATR, on the tick.
 *  Confirmation    A 5-minute bar that CLOSES inside the entry window, in the
 *                  trade direction, beyond the entry zone's far edge
 *                  (above the zone for longs, below for shorts).
 */
import type { Candle } from './indicators';
import { atr } from './indicators';
import { analyzeStructure, sessionStamp, DEFAULT_STRUCTURE_CONFIG, type Trend } from './structure';
import { holidayOn, earlyCloseOn } from './marketHolidays';
import type { CalendarEvent } from './economicCalendar';
import { contractSpec, roundToTick } from './contracts';

export interface PowerHourConfig {
  entryStart: number; // ET minutes after midnight
  entryEnd: number;
  exitStart: number;
  exitEnd: number;
  maxDataAgeMin: number;
  newsBeforeMin: number;
  minRR: number;
  minRangeRatio: number;
  maxRangeRatio: number;
  /** Stop buffer beyond the invalidation swing, in 5m ATR. */
  stopBufferAtr: number;
}

export const DEFAULT_POWER_HOUR: PowerHourConfig = {
  entryStart: 14 * 60 + 38,
  entryEnd: 14 * 60 + 45,
  exitStart: 15 * 60 + 15,
  exitEnd: 15 * 60 + 20,
  maxDataAgeMin: 20,
  newsBeforeMin: 30,
  minRR: 1.5,
  minRangeRatio: 0.5,
  maxRangeRatio: 2.0,
  stopBufferAtr: 0.1,
};

export type PowerHourStatus = 'NO TRADE' | 'CANDIDATE' | 'CONFIRMED' | 'NO DATA';
export type PowerHourPhase = 'before' | 'entry' | 'between' | 'exit' | 'after' | 'closed';

export interface PhRule {
  key: string;
  label: string;
  passed: boolean | null;
  detail: string;
}

export interface PowerHourResult {
  instrument: string;
  status: PowerHourStatus;
  phase: PowerHourPhase;
  minutesToEntry: number | null;
  minutesToExit: number | null;
  direction: 'long' | 'short' | null;
  lastPrice: number | null;
  lastBarTime: string | null;
  dataAgeMin: number | null;
  vwap: number | null;
  vwapRelation: 'above' | 'below' | 'at' | null;
  trend5m: Trend | null;
  trend15m: Trend | null;
  lastEvent5m: string | null;
  prevSession: { high: number; low: number; close: number } | null;
  today: { high: number; low: number; open: number } | null;
  volume: { last30: number; avgLast30: number | null; ratio: number | null } | null;
  volatility: { atr5m: number | null; todayRange: number | null; avgRange: number | null; ratio: number | null };
  liquidityAbove: { name: string; price: number }[];
  liquidityBelow: { name: string; price: number }[];
  plan: {
    entryZone: [number, number];
    invalidation: number;
    stop: number;
    target: number;
    targetName: string;
    rr: number;
  } | null;
  rules: PhRule[];
  reasons: string[];
  confirmation: string;
  notes: string[];
}

function rthBars(bars: { b: Candle; s: ReturnType<typeof sessionStamp> }[], session: string) {
  return bars.filter((x) => x.s.session === session && x.s.etMins >= 9 * 60 + 30 && x.s.etMins < 16 * 60).map((x) => x.b);
}

/** Volume-weighted average of typical price; null when the feed carries no volume. */
export function vwapOf(bars: Candle[]): number | null {
  let pv = 0, v = 0;
  for (const b of bars) {
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    v += b.volume;
  }
  return v > 0 ? pv / v : null;
}

function fmtMins(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function windowLabel(cfg: PowerHourConfig): string {
  return `entry ${fmtMins(cfg.entryStart)}–${fmtMins(cfg.entryEnd)}, exit ${fmtMins(cfg.exitStart)}–${fmtMins(cfg.exitEnd)} ET`;
}

export function powerHour(opts: {
  instrument: string;
  bars5m: Candle[];
  bars15m: Candle[];
  now: Date;
  events: CalendarEvent[];
  calendarAvailable: boolean;
  cfg?: PowerHourConfig;
}): PowerHourResult {
  const cfg = opts.cfg ?? DEFAULT_POWER_HOUR;
  const { now } = opts;
  const notes: string[] = [];
  const nowS = sessionStamp(now.getTime() / 1000);
  const etDate = (() => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now).map((x) => [x.type, x.value]));
    return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday as string };
  })();
  const m = nowS.etMins;

  const phase: PowerHourPhase =
    etDate.weekday === 'Sat' || etDate.weekday === 'Sun' ? 'closed'
    : m < cfg.entryStart ? 'before'
    : m < cfg.entryEnd ? 'entry'
    : m < cfg.exitStart ? 'between'
    : m < cfg.exitEnd ? 'exit'
    : 'after';
  const minutesToEntry = phase === 'before' ? cfg.entryStart - m : null;
  const minutesToExit = phase === 'before' || phase === 'entry' || phase === 'between' ? cfg.exitStart - m : null;

  // Only closed bars (5m bar stamped at its open).
  const closed5 = opts.bars5m.filter((b) => b.time + 300 <= now.getTime() / 1000);
  const closed15 = opts.bars15m.filter((b) => b.time + 900 <= now.getTime() / 1000);
  const stamped = closed5.map((b) => ({ b, s: sessionStamp(b.time) }));
  const sessions = Array.from(new Set(stamped.map((x) => x.s.session))).sort();
  const todaySession = etDate.ymd;
  const todayRth = rthBars(stamped, todaySession);
  const prevSessions = sessions.filter((s) => s < todaySession);
  const prevRthByDay = prevSessions.map((s) => rthBars(stamped, s)).filter((x) => x.length > 0);
  const prevRth = prevRthByDay[prevRthByDay.length - 1] ?? null;

  const last = closed5[closed5.length - 1] ?? null;
  const dataAgeMin = last ? Math.max(0, Math.round((now.getTime() / 1000 - (last.time + 300)) / 60)) : null;
  const lastPrice = last?.close ?? null;

  const s5 = closed5.length ? analyzeStructure(closed5, { ...DEFAULT_STRUCTURE_CONFIG, rangeLookback: 24 }) : null;
  const s15 = closed15.length ? analyzeStructure(closed15, { ...DEFAULT_STRUCTURE_CONFIG, rangeLookback: 16 }) : null;
  const trend5m = s5?.trend ?? null;
  const trend15m = s15?.trend ?? null;

  const vwap = todayRth.length ? vwapOf(todayRth) : null;
  if (todayRth.length && vwap == null) notes.push('The feed returned no volume for today, so VWAP cannot be computed.');
  const atr5 = closed5.length ? atr(closed5, 14) : null;
  const vwapRelation = vwap == null || lastPrice == null ? null : atr5 && Math.abs(lastPrice - vwap) < 0.1 * atr5 ? 'at' : lastPrice > vwap ? 'above' : 'below';

  const today = todayRth.length ? { open: todayRth[0].open, high: Math.max(...todayRth.map((b) => b.high)), low: Math.min(...todayRth.map((b) => b.low)) } : null;
  const prevSession = prevRth ? { high: Math.max(...prevRth.map((b) => b.high)), low: Math.min(...prevRth.map((b) => b.low)), close: prevRth[prevRth.length - 1].close } : null;

  const priorRanges = prevRthByDay.slice(-5).map((d) => Math.max(...d.map((b) => b.high)) - Math.min(...d.map((b) => b.low)));
  const avgRange = priorRanges.length ? priorRanges.reduce((a, b) => a + b, 0) / priorRanges.length : null;
  const todayRange = today ? today.high - today.low : null;
  const rangeRatio = avgRange && todayRange != null ? Math.round((todayRange / avgRange) * 100) / 100 : null;

  // Volume: last 30 minutes vs the same clock window on prior sessions.
  let volume: PowerHourResult['volume'] = null;
  if (todayRth.length && last) {
    const lastMins = sessionStamp(last.time).etMins;
    const inLast30 = (x: { s: ReturnType<typeof sessionStamp> }) => x.s.etMins > lastMins - 30 && x.s.etMins <= lastMins;
    const vol = (rows: typeof stamped) => rows.reduce((s, x) => s + x.b.volume, 0);
    const last30 = vol(stamped.filter((x) => x.s.session === todaySession && inLast30(x)));
    const prior = prevSessions.slice(-5).map((sess) => vol(stamped.filter((x) => x.s.session === sess && inLast30(x)))).filter((v) => v > 0);
    const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
    volume = { last30, avgLast30: avg, ratio: avg ? Math.round((last30 / avg) * 100) / 100 : null };
  }

  // Liquidity around price.
  const levels: { name: string; price: number }[] = [];
  if (prevSession) levels.push({ name: 'Prior RTH high', price: prevSession.high }, { name: 'Prior RTH low', price: prevSession.low }, { name: 'Prior close', price: prevSession.close });
  if (today) levels.push({ name: 'Today high', price: today.high }, { name: 'Today low', price: today.low });
  if (vwap != null) levels.push({ name: 'VWAP', price: vwap });
  for (const e of s5?.equalHighs ?? []) levels.push({ name: '5m equal highs', price: e.price });
  for (const e of s5?.equalLows ?? []) levels.push({ name: '5m equal lows', price: e.price });
  const liquidityAbove = lastPrice == null ? [] : levels.filter((l) => l.price > lastPrice).sort((a, b) => a.price - b.price);
  const liquidityBelow = lastPrice == null ? [] : levels.filter((l) => l.price < lastPrice).sort((a, b) => b.price - a.price);

  const direction: 'long' | 'short' | null = trend5m === 'bullish' ? 'long' : trend5m === 'bearish' ? 'short' : null;

  // Plan: zone between VWAP and the latest internal swing on the trade side; invalidation beyond that swing.
  let plan: PowerHourResult['plan'] = null;
  const spec = contractSpec(opts.instrument);
  const tick = spec?.tickSize ?? 0.01;
  if (direction && s5 && lastPrice != null && atr5) {
    const swingsSide = s5.swings.filter((s) => s.kind === (direction === 'long' ? 'low' : 'high') && s.confirmedAt < closed5.length);
    const lastSwing = swingsSide[swingsSide.length - 1];
    if (lastSwing) {
      // Zone = the support (long) / resistance (short) band: the nearer of VWAP and
      // the last 5m swing, extended 0.5 × 5m ATR toward price.
      const edge = direction === 'long' ? Math.max(lastSwing.price, vwap ?? lastSwing.price) : Math.min(lastSwing.price, vwap ?? lastSwing.price);
      const far = direction === 'long' ? edge + 0.5 * atr5 : edge - 0.5 * atr5;
      const zone: [number, number] = [roundToTick(Math.min(edge, far), tick), roundToTick(Math.max(edge, far), tick)];
      const invalidation = lastSwing.price;
      const stop = roundToTick(direction === 'long' ? invalidation - cfg.stopBufferAtr * atr5 : invalidation + cfg.stopBufferAtr * atr5, tick);
      const mid = (zone[0] + zone[1]) / 2;
      const opp = direction === 'long' ? liquidityAbove.filter((l) => l.name !== 'VWAP') : liquidityBelow.filter((l) => l.name !== 'VWAP');
      const tgt = opp[0];
      const risk = Math.abs(mid - stop);
      if (tgt && risk > 0) {
        plan = { entryZone: zone, invalidation, stop, target: roundToTick(tgt.price, tick), targetName: tgt.name, rr: Math.round((Math.abs(tgt.price - mid) / risk) * 100) / 100 };
      } else if (!tgt) notes.push('No opposing liquidity level found in the fetched bars — no target, so no plan.');
    }
  }

  // ─── Rules ────────────────────────────────────────────────────────────────
  const rules: PhRule[] = [];
  const hol = holidayOn(etDate.ymd);
  const early = earlyCloseOn(etDate.ymd);
  const sessionOk = phase !== 'closed' && !hol && !early;
  rules.push({ key: 'session', label: 'Cash session open, full day', passed: sessionOk, detail: phase === 'closed' ? 'Weekend.' : hol ? `${hol.name} — cash closed.` : early ? `${early.name} — early close, no Power Hour.` : 'Regular session day.' });

  const fresh = dataAgeMin != null && dataAgeMin <= cfg.maxDataAgeMin;
  rules.push({ key: 'data', label: `5m data ≤ ${cfg.maxDataAgeMin} min old`, passed: fresh, detail: dataAgeMin == null ? 'No 5-minute bars returned.' : `Newest closed 5m bar is ${dataAgeMin} min old.` });

  const startMsToday = now.getTime() + (cfg.entryStart - m) * 60_000 - cfg.newsBeforeMin * 60_000;
  const endMsToday = now.getTime() + (cfg.exitEnd - m) * 60_000;
  const clash = opts.events.find((e) => e.impact === 'High' && e.country === 'USD' && Date.parse(e.at) >= startMsToday && Date.parse(e.at) <= endMsToday);
  rules.push({
    key: 'news',
    label: 'No high-impact USD news near the window',
    passed: !opts.calendarAvailable ? false : !clash,
    detail: !opts.calendarAvailable ? 'Calendar unavailable — news could not be checked.' : clash ? `${clash.title} at ${new Date(clash.at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET.` : 'None found in this week\'s calendar.',
  });

  rules.push({ key: 'structure', label: '5m structure is directional', passed: trend5m == null ? null : trend5m !== 'range', detail: trend5m == null ? 'No 5m bars.' : `5m trend: ${trend5m}${s5?.lastEvent ? ` (last ${s5.lastEvent.type} ${s5.lastEvent.direction})` : ''}.` });

  const vwapOk = direction == null || vwapRelation == null ? null : (direction === 'long' && vwapRelation === 'above') || (direction === 'short' && vwapRelation === 'below');
  rules.push({ key: 'vwap', label: 'Price on the trend side of VWAP', passed: vwapOk, detail: vwap == null ? 'VWAP unavailable.' : `Price ${vwapRelation} VWAP ${vwap.toFixed(2)}.` });

  const htfOk = direction == null || trend15m == null ? null : !((direction === 'long' && trend15m === 'bearish') || (direction === 'short' && trend15m === 'bullish'));
  rules.push({ key: 'htf', label: '15m trend not opposing', passed: htfOk, detail: `15m trend: ${trend15m ?? 'unknown'}.` });

  const volOk = rangeRatio == null ? null : rangeRatio >= cfg.minRangeRatio && rangeRatio <= cfg.maxRangeRatio;
  rules.push({ key: 'volatility', label: `Range ${cfg.minRangeRatio}–${cfg.maxRangeRatio}× normal`, passed: volOk, detail: rangeRatio == null ? 'Not enough prior sessions to compare.' : `Today's range is ${rangeRatio}× the prior ${priorRanges.length}-session average.` });

  const rrOk = plan ? plan.rr >= cfg.minRR : null;
  rules.push({ key: 'rr', label: `Reward ≥ ${cfg.minRR}R to nearest opposing liquidity`, passed: rrOk, detail: plan ? `${plan.rr}R to ${plan.targetName} (${plan.target}).` : 'No plan — missing swing, ATR or target.' });

  const reasons = rules.filter((r) => r.passed !== true).map((r) => `${r.label}: ${r.detail}`);
  const allPass = rules.every((r) => r.passed === true);

  let status: PowerHourStatus = !last ? 'NO DATA' : allPass ? 'CANDIDATE' : 'NO TRADE';
  if (!fresh && last) status = 'NO TRADE';

  // Confirmation: a closed 5m bar inside the entry window beyond the zone in the trade direction.
  const confirmation = plan
    ? direction === 'long'
      ? `A 5-minute candle that closes above ${plan.entryZone[1]} between ${fmtMins(cfg.entryStart)} and ${fmtMins(cfg.entryEnd)} ET, with price still above ${plan.invalidation}.`
      : `A 5-minute candle that closes below ${plan.entryZone[0]} between ${fmtMins(cfg.entryStart)} and ${fmtMins(cfg.entryEnd)} ET, with price still below ${plan.invalidation}.`
    : 'No plan, so no confirmation to wait for.';
  if (status === 'CANDIDATE' && plan) {
    const inWindow = closed5.filter((b) => {
      const s = sessionStamp(b.time + 300); // bar CLOSE time
      return s.session === todaySession && s.etMins > cfg.entryStart && s.etMins <= cfg.entryEnd;
    });
    const confirmed = inWindow.some((b) => (direction === 'long' ? b.close > plan!.entryZone[1] && b.low > plan!.invalidation : b.close < plan!.entryZone[0] && b.high < plan!.invalidation));
    if (confirmed) status = 'CONFIRMED';
  }

  return {
    instrument: opts.instrument,
    status,
    phase,
    minutesToEntry,
    minutesToExit,
    direction,
    lastPrice,
    lastBarTime: last ? new Date(last.time * 1000).toISOString() : null,
    dataAgeMin,
    vwap: vwap != null ? Math.round(vwap * 100) / 100 : null,
    vwapRelation,
    trend5m,
    trend15m,
    lastEvent5m: s5?.lastEvent ? `${s5.lastEvent.type} ${s5.lastEvent.direction} @ ${s5.lastEvent.level}` : null,
    prevSession,
    today,
    volume,
    volatility: { atr5m: atr5 != null ? Math.round(atr5 * 100) / 100 : null, todayRange, avgRange: avgRange != null ? Math.round(avgRange * 100) / 100 : null, ratio: rangeRatio },
    liquidityAbove: liquidityAbove.slice(0, 4),
    liquidityBelow: liquidityBelow.slice(0, 4),
    plan,
    rules,
    reasons,
    confirmation,
    notes,
  };
}
