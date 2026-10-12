/**
 * Build scripts/fixtures/selector-daily.json for the selector snapshot test.
 *
 * Tries Yahoo first (2y daily for NQ=F and CL=F). If the network is blocked it
 * writes a synthetic regime-switching series instead and records
 * "source": "synthetic" so nobody mistakes it for history.
 *
 * Run: npx tsx scripts/make-selector-fixture.ts
 * Then refresh the snapshot: UPDATE_SNAPSHOT=1 npm test
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchYahooCandles, type YFCandle } from '../lib/yahooChart';

const OUT = join(__dirname, 'fixtures', 'selector-daily.json');
const SYMBOLS: { symbol: string; yahoo: string; start: number; vol: number }[] = [
  { symbol: 'NQ', yahoo: 'NQ=F', start: 20000, vol: 0.013 },
  { symbol: 'CL', yahoo: 'CL=F', start: 70, vol: 0.02 },
];

let seed = 777;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Synthetic daily bars on real weekday dates ending 2026-10-09 (a Friday), 13:00 UTC stamps like Yahoo. */
function syntheticDaily(start: number, vol: number, days = 520): YFCandle[] {
  const out: YFCandle[] = [];
  let px = start;
  let drift = 0;
  let left = 0;
  let t = Date.UTC(2026, 9, 9, 13) / 1000; // Fri 2026-10-09
  // Walk back `days` weekdays.
  const stamps: number[] = [];
  let cursor = t;
  while (stamps.length < days) {
    const wd = new Date(cursor * 1000).getUTCDay();
    if (wd !== 0 && wd !== 6) stamps.unshift(cursor);
    cursor -= 86400;
  }
  for (const stamp of stamps) {
    if (left <= 0) {
      const r = rand();
      drift = r < 0.35 ? 0.0025 : r < 0.7 ? -0.0025 : 0;
      left = 5 + Math.floor(rand() * 20);
    }
    left--;
    const open = px * Math.exp((vol / 4) * randn());
    let hi = open;
    let lo = open;
    let p = open;
    for (let s = 0; s < 6; s++) {
      p *= Math.exp(drift / 6 + (vol / Math.sqrt(6)) * randn());
      hi = Math.max(hi, p);
      lo = Math.min(lo, p);
    }
    out.push({ time: stamp, open, high: hi, low: lo, close: p, volume: 100000 });
    px = p;
  }
  t = stamps[stamps.length - 1];
  return out;
}

(async () => {
  const series: Record<string, YFCandle[]> = {};
  let source = 'yahoo';
  for (const s of SYMBOLS) {
    try {
      const { candles } = await fetchYahooCandles(s.yahoo, '2y', '1d');
      series[s.symbol] = candles;
    } catch {
      source = 'synthetic';
      series[s.symbol] = syntheticDaily(s.start, s.vol);
    }
  }
  const last = Math.max(...Object.values(series).map((c) => c[c.length - 1].time));
  // "now" = the Saturday after the last bar so the last week counts as complete.
  const now = new Date((last + 86400) * 1000);
  now.setUTCHours(15, 0, 0, 0);
  mkdirSync(join(__dirname, 'fixtures'), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        source,
        note: source === 'synthetic' ? 'Synthetic regime-switching bars (Yahoo unreachable when generated). Re-run make-selector-fixture.ts with network access for real history.' : 'Yahoo Finance daily bars.',
        now: now.toISOString(),
        series: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.map((c) => [c.time, +c.open.toFixed(4), +c.high.toFixed(4), +c.low.toFixed(4), +c.close.toFixed(4)])])),
      },
      null,
      0,
    ),
  );
  console.log(`wrote ${OUT} (${source})`);
})();
