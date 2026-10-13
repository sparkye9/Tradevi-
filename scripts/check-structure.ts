/** Structure, setup and Power Hour engine checks (called from check-trading.ts). */
import type { Candle } from '../lib/indicators';
import {
  findSwings, structureEvents, findFvgs, analyzeStructure, resampleSessionHours, sessionStamp,
  liquidityMap, consolidate, dropFormingBar, equalLevels,
} from '../lib/structure';
import { generateSetups } from '../lib/setupEngine';
import { powerHour, vwapOf } from '../lib/powerHourEngine';
import { marketClock } from '../lib/powerHour';

type Check = (name: string, cond: boolean) => void;

const T0 = Date.UTC(2026, 9, 5, 13, 30) / 1000; // Mon 2026-10-05 09:30 ET

/** Bars along straight segments between pivot prices, `step` seconds apart. */
function path(points: number[], barsPerLeg: number, start = T0, step = 900, vol = 100): Candle[] {
  const out: Candle[] = [];
  let t = start;
  for (let k = 0; k < points.length - 1; k++) {
    for (let j = 0; j < barsPerLeg; j++) {
      const a = points[k] + ((points[k + 1] - points[k]) * j) / barsPerLeg;
      const b = points[k] + ((points[k + 1] - points[k]) * (j + 1)) / barsPerLeg;
      // The bar that makes a turn extends 0.2 past it; the next bar only 0.1, so pivots are strict.
      const rising = b >= a;
      out.push({ time: t, open: a, close: b, high: rising ? b + 0.2 : a + 0.1, low: rising ? a - 0.1 : b - 0.2, volume: vol });
      t += step;
    }
  }
  return out;
}

const bar = (i: number, o: number, h: number, l: number, c: number, step = 900): Candle => ({ time: T0 + i * step, open: o, high: h, low: l, close: c, volume: 100 });

export function runSection(check: Check): void {
  // ─── Swings + labels ──────────────────────────────────────────────────────
  const up = path([100, 110, 105, 115, 110, 120, 115, 125], 4);
  const sw = findSwings(up, 2);
  const highs = sw.filter((s) => s.kind === 'high');
  const lows = sw.filter((s) => s.kind === 'low');
  check('swings: uptrend highs labelled HH after the first', highs.length >= 3 && highs.slice(1).every((h) => h.label === 'HH'));
  check('swings: uptrend lows labelled HL after the first', lows.length >= 2 && lows.slice(1).every((l) => l.label === 'HL'));
  check('swings: a pivot is only known `strength` bars later', sw.every((s) => s.confirmedAt === s.index + 2));

  // ─── BOS / CHOCH ──────────────────────────────────────────────────────────
  const upThenDown = path([100, 110, 105, 115, 110, 120, 114, 100], 4);
  const ev = structureEvents(upThenDown, findSwings(upThenDown, 2), 'close').events;
  check('events: bullish breaks in the uptrend are BOS', ev.some((e) => e.type === 'BOS' && e.direction === 'bullish'));
  const choch = ev.find((e) => e.type === 'CHOCH');
  check('events: first bearish break after an uptrend is a CHOCH', choch?.direction === 'bearish');
  check('events: never fire before the broken swing is confirmed', ev.every((e) => {
    const s = findSwings(upThenDown, 2).find((x) => x.index === e.brokenSwingIndex)!;
    return e.index >= s.confirmedAt;
  }));
  {
    // Swing high at 110 (bar 3). Bar 6 wicks to 111 but closes at 109.
    const c = [bar(0, 100, 101, 99, 100), bar(1, 100, 104, 99.5, 103), bar(2, 103, 107, 102, 106), bar(3, 106, 110, 105, 108), bar(4, 108, 108.5, 104, 105), bar(5, 105, 106, 103, 104), bar(6, 104, 111, 103.5, 109), bar(7, 109, 109.5, 107, 108)];
    const s = findSwings(c, 2);
    const byClose = structureEvents(c, s, 'close').events.filter((e) => e.direction === 'bullish');
    const byWick = structureEvents(c, s, 'wick').events.filter((e) => e.direction === 'bullish');
    check('BOS by close ignores a wick-only break', byClose.length === 0);
    check('BOS by wick counts the same bar', byWick.length === 1 && byWick[0].index === 6);
  }

  // ─── FVG ──────────────────────────────────────────────────────────────────
  {
    const base = [bar(0, 99, 100, 98, 99.5), bar(1, 99.5, 104, 99.4, 103.8), bar(2, 103.8, 105, 102, 104.5)];
    check('FVG: bullish gap 100–102 detected', (() => { const f = findFvgs(base, 0.5, 'bullish'); return f.length === 1 && f[0].bottom === 100 && f[0].top === 102 && f[0].alignedWithTrend; })());
    check('FVG: below the size threshold is ignored', findFvgs(base, 2.5, 'bullish').length === 0);
    const partial = findFvgs([...base, bar(3, 104, 104.5, 101, 103)], 0.5, 'bullish')[0];
    check('FVG: wick into the gap = partial', partial.state === 'partial');
    const full = findFvgs([...base, bar(3, 104, 104.5, 99.8, 100.5)], 0.5, 'bullish')[0];
    check('FVG: trade through the whole gap = mitigated', full.state === 'mitigated');
    const inval = findFvgs([...base, bar(3, 104, 104.5, 98.5, 99)], 0.5, 'bullish')[0];
    check('FVG: close below the gap = invalidated', inval.state === 'invalidated');
    const bear = findFvgs([bar(0, 105, 106, 104, 104.5), bar(1, 104.5, 104.6, 99, 99.5), bar(2, 99.5, 102, 98, 98.5)], 0.5, 'bullish')[0];
    check('FVG: bearish gap 102–104, not aligned in an uptrend', bear.direction === 'bearish' && bear.bottom === 102 && bear.top === 104 && !bear.alignedWithTrend);
  }

  // ─── Equal highs / consolidation ──────────────────────────────────────────
  {
    const flat = path([100, 110, 102, 110.05, 103, 109], 4);
    const eq = equalLevels(flat, findSwings(flat, 2), 0.2);
    check('equal highs within tolerance are found and untaken', eq.highs.length === 1 && eq.highs[0].price === 110.25);
    const st = analyzeStructure(path([100, 101, 100, 101, 100, 101, 100], 4), { internalStrength: 2, externalStrength: 5, confirmation: 'close', fvgMinAtr: 0.1, equalTolAtr: 0.1, rangeLookback: 30, dropForming: true });
    check('no breaks → consolidation (range)', st.trend === 'range');
  }

  // ─── Forming bar / session time ───────────────────────────────────────────
  {
    const bars = path([100, 101], 3, T0, 300);
    check('forming 5m bar dropped', dropFormingBar(bars, 300, new Date((bars[2].time + 120) * 1000)).length === 2);
    check('closed 5m bar kept', dropFormingBar(bars, 300, new Date((bars[2].time + 300) * 1000)).length === 3);
    check('sessionStamp: 7 PM ET belongs to the next session date', sessionStamp(Date.UTC(2026, 9, 5, 23, 0) / 1000).session === '2026-10-06');
    // 4H buckets anchored to 18:00 ET in both EDT (Oct) and EST (Nov 3, after DST ends Nov 1).
    const hourly = (startUtc: number) => Array.from({ length: 8 }, (_, i) => ({ time: startUtc + i * 3600, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }));
    const edt = resampleSessionHours(hourly(Date.UTC(2026, 9, 5, 22, 0) / 1000), 4); // 18:00 EDT
    const est = resampleSessionHours(hourly(Date.UTC(2026, 10, 2, 23, 0) / 1000), 4); // 18:00 EST
    check('4H: EDT buckets open at 18:00 and 22:00 ET', edt.length === 2 && sessionStamp(edt[0].time).etMins === 18 * 60 && sessionStamp(edt[1].time).etMins === 22 * 60);
    check('4H: EST buckets also open at 18:00 and 22:00 ET (DST-safe)', est.length === 2 && sessionStamp(est[0].time).etMins === 18 * 60 && sessionStamp(est[1].time).etMins === 22 * 60);
  }

  // ─── Liquidity ────────────────────────────────────────────────────────────
  {
    // Session 1 (Mon RTH): range 100–110. Session 2 (Tue): dips to 99 then closes back at 101 → sweep of PDL.
    const s1 = path([105, 110, 100, 104], 12, Date.UTC(2026, 9, 5, 13, 30) / 1000, 300);
    const s2 = [
      ...path([104, 102], 6, Date.UTC(2026, 9, 6, 13, 30) / 1000, 300),
      { time: Date.UTC(2026, 9, 6, 14, 0) / 1000, open: 102, high: 102.2, low: 99, close: 101, volume: 100 },
      ...path([101, 103], 6, Date.UTC(2026, 9, 6, 14, 5) / 1000, 300),
    ];
    const liq = liquidityMap([...s1, ...s2]);
    const pdl = liq.levels.find((l) => l.name === 'Previous day low');
    check('liquidity: previous day low = 99.8 (100 − 0.2 wick)', pdl?.price === 99.8);
    check('liquidity: PDL sweep detected (wick through, close back)', Boolean(pdl?.swept) && liq.sweeps.some((s) => s.name === 'Previous day low'));
    check('liquidity: PDH (110.2) untaken', liq.levels.find((l) => l.name === 'Previous day high')?.taken === false);
  }

  // ─── Multi-timeframe ──────────────────────────────────────────────────────
  {
    const c = consolidate({ '1D': 'bullish', '4H': 'bullish', '1H': 'bullish', '15m': 'bearish', '5m': 'bearish', '1m': 'bearish' });
    check('MTF: HTF bull / LTF bear is shown as a conflict, not forced to agree', c.htf === 'bullish' && c.ltf === 'bearish' && c.conflicts.length === 2);
    check('MTF: weighted score is positive (HTF weighs more)', c.score > 0);
    const m = consolidate({ '1D': 'bullish', '15m': null });
    check('MTF: missing timeframes are listed', /Missing/.test(m.summary));
  }

  // ─── Setup engine ─────────────────────────────────────────────────────────
  {
    // 15m uptrend with a gap-up displacement leaving an unfilled bullish FVG below price.
    const pre = path([100, 104, 102, 106], 4);
    const n = pre.length;
    const gap = [bar(n, 106, 106.4, 105.8, 106.2), bar(n + 1, 106.2, 110, 106.1, 109.8), bar(n + 2, 109.8, 111, 108, 110.5)];
    const post = path([110.5, 112, 110.8, 113], 4, T0 + (n + 3) * 900);
    const bars15 = [...pre, ...gap, ...post];
    const s15 = analyzeStructure(bars15);
    const clock = marketClock(new Date('2026-10-06T15:00:00Z'));
    const base = {
      instrument: 'MNQ', now: new Date('2026-10-06T15:00:00Z'), tf: { '15m': s15 }, bars15m: bars15, bars5m: [] as Candle[],
      liquidity: { session: null, levels: [{ name: 'Previous day high', price: 118, side: 'high' as const, taken: false, swept: false, sweptAt: null }], sweeps: [], notes: [] },
      htfBias: 'bullish' as const, fresh: { '15m': true, '5m': true }, clock, events: [], calendarAvailable: true,
    };
    const setups = generateSetups(base);
    const pb = setups.find((s) => s.type === 'Pullback');
    check('setups: bullish HTF + unfilled 15m FVG → long pullback candidate', pb?.direction === 'long' && pb.entryZone[0] < pb.entryZone[1]);
    check('setups: stop is beyond invalidation, on the MNQ tick', pb != null && pb.stop < pb.invalidation && Math.abs(pb.stop / 0.25 - Math.round(pb.stop / 0.25)) < 1e-9);
    check('setups: score equals the sum of its factors (transparent)', pb != null && pb.score === pb.factors.reduce((s, f) => s + f.points, 0) && pb.factors.every((f) => f.points <= f.max));
    check('setups: HTF range → no pullback/breakout candidates', generateSetups({ ...base, htfBias: 'range' }).every((s) => s.type !== 'Pullback' && s.type !== 'Breakout'));
    const stale = generateSetups({ ...base, fresh: { '15m': false, '5m': false } });
    check('setups: stale data can never be Confirmed', stale.every((s) => s.status !== 'Confirmed' && !s.dataOk));
    check('setups: news unavailable scores 0 on news', generateSetups({ ...base, calendarAvailable: false }).every((s) => s.factors.find((f) => f.key === 'news')!.points === 0));
  }

  // ─── Power Hour ───────────────────────────────────────────────────────────
  {
    // Three RTH sessions of 5m bars, 09:30–16:00 ET (EDT → 13:30–20:00 UTC).
    const day = (d: number, pts: number[]) => path(pts, 13, Date.UTC(2026, 9, d, 13, 30) / 1000, 300, 1000);
    const bars5 = [...day(5, [100, 104, 101, 106, 103, 108]), ...day(6, [108, 111, 107, 113, 110, 115]), ...day(7, [115, 117, 114, 119, 116, 121])];
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 7, h + 4, m));
    const before = powerHour({ instrument: 'MNQ', bars5m: bars5.filter((b) => b.time + 300 <= at(14, 30).getTime() / 1000), bars15m: [], now: at(14, 30), events: [], calendarAvailable: true });
    check('power hour: 2:30 PM ET is "before", 8 min to the 2:38 entry window', before.phase === 'before' && before.minutesToEntry === 8);
    check('power hour: VWAP computed from RTH bars with volume', before.vwap != null && before.vwap > 114 && before.vwap < 121);
    check('power hour: every rule is listed with a pass/fail', before.rules.length === 8 && before.rules.every((r) => typeof r.detail === 'string'));
    const news = powerHour({ instrument: 'MNQ', bars5m: bars5.filter((b) => b.time + 300 <= at(14, 30).getTime() / 1000), bars15m: [], now: at(14, 30), events: [{ title: 'FOMC Statement', country: 'USD', impact: 'High', at: at(15, 0).toISOString(), forecast: '', previous: '', actual: '' }], calendarAvailable: true });
    check('power hour: FOMC inside the window → NO TRADE', news.status === 'NO TRADE' && news.rules.find((r) => r.key === 'news')!.passed === false);
    const stale = powerHour({ instrument: 'MNQ', bars5m: bars5.filter((b) => b.time < at(13, 0).getTime() / 1000), bars15m: [], now: at(14, 40), events: [], calendarAvailable: true });
    check('power hour: stale bars → NO TRADE with the data rule failed', stale.status === 'NO TRADE' && stale.rules.find((r) => r.key === 'data')!.passed === false);
    const none = powerHour({ instrument: 'MNQ', bars5m: [], bars15m: [], now: at(14, 40), events: [], calendarAvailable: true });
    check('power hour: no bars → NO DATA, never a trade', none.status === 'NO DATA' && none.plan === null);
    const sat = powerHour({ instrument: 'MNQ', bars5m: bars5, bars15m: [], now: new Date(Date.UTC(2026, 9, 10, 18, 40)), events: [], calendarAvailable: true });
    check('power hour: weekend → closed / NO TRADE', sat.phase === 'closed' && sat.status !== 'CANDIDATE' && sat.status !== 'CONFIRMED');
    const early = powerHour({ instrument: 'MNQ', bars5m: [], bars15m: [], now: new Date(Date.UTC(2026, 10, 27, 19, 40)), events: [], calendarAvailable: true });
    check('power hour: early-close day fails the session rule', early.rules.find((r) => r.key === 'session')!.passed === false);
    check('VWAP with zero volume is null (not a fake average)', vwapOf([{ time: 0, open: 1, high: 2, low: 1, close: 1.5, volume: 0 }]) === null);
  }
}
