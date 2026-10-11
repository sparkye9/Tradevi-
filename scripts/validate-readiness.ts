/**
 * Phase 1.6 validation: replay the graded readiness over the last N sessions
 * per instrument and print the A / B / C distribution plus the condition that
 * fails most often.
 *
 * Uses real Yahoo bars when the network allows it. If Yahoo is unreachable it
 * falls back to a synthetic regime-switching random walk and SAYS SO — those
 * numbers are a null-model estimate, not history.
 *
 * Run: npx tsx scripts/validate-readiness.ts [sessions=30] [instruments=MNQ,MES,...]
 */
import { fetchYahooCandles, type YFCandle } from '../lib/yahooChart';
import { classify, structureLevels, swingSuggestion, INSTRUMENT_MAP, READINESS_INSTRUMENTS, type Timeframe, type TrendRead, type StructureLevels } from '../lib/trendBias';
import { swingSetupFromDaily } from '../lib/futuresSetups';
import { scoreReadiness, gradeFor, type ReadinessComponent } from '../lib/readiness';

const SESSIONS = Number(process.argv[2] ?? '30');
const INSTRUMENTS = (process.argv[3] ?? READINESS_INSTRUMENTS.join(',')).split(',').map((s) => s.trim().toUpperCase());

// ─── synthetic fallback ─────────────────────────────────────────────────────
let seed = 4242;
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
function syntheticHourly(startPrice: number, dailyVol: number): YFCandle[] {
  const HOURS = 23;
  const DAYS = 2 * 252 + 70;
  const hourlyVol = dailyVol / Math.sqrt(HOURS);
  const out: YFCandle[] = [];
  let px = startPrice;
  let drift = 0;
  let left = 0;
  let t = Math.floor(Date.now() / 1000) - DAYS * 86400 * 1.4;
  for (let d = 0; d < DAYS; d++) {
    if (left <= 0) {
      const r = rand();
      drift = r < 0.35 ? 0.0015 : r < 0.7 ? -0.0015 : 0;
      left = 5 + Math.floor(rand() * 20);
    }
    left--;
    if (d % 5 === 0 && d > 0) t += 2 * 86400;
    for (let h = 0; h < HOURS; h++) {
      const open = px;
      let hi = open;
      let lo = open;
      let p = open;
      for (let s = 0; s < 4; s++) {
        p *= Math.exp(drift / HOURS / 4 + (hourlyVol / 2) * randn());
        hi = Math.max(hi, p);
        lo = Math.min(lo, p);
      }
      out.push({ time: t, open, high: hi, low: lo, close: p, volume: 1000 });
      px = p;
      t += 3600;
    }
    t += 86400 - HOURS * 3600;
  }
  return out;
}
function bucket(candles: YFCandle[], seconds: number): YFCandle[] {
  const map = new Map<number, YFCandle[]>();
  for (const c of candles) {
    const k = Math.floor(c.time / seconds) * seconds;
    const g = map.get(k);
    if (g) g.push(c);
    else map.set(k, [c]);
  }
  return Array.from(map.keys())
    .sort((a, b) => a - b)
    .map((k) => {
      const g = map.get(k)!;
      return { time: k, open: g[0].open, high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)), close: g[g.length - 1].close, volume: 0 };
    });
}

interface Series {
  weekly: YFCandle[];
  daily: YFCandle[];
  hourly: YFCandle[];
  synthetic: boolean;
}

async function loadSeries(symbol: string): Promise<Series> {
  try {
    const [w, d, h] = await Promise.all([
      fetchYahooCandles(symbol, '2y', '1wk'),
      fetchYahooCandles(symbol, '2y', '1d'),
      fetchYahooCandles(symbol, '2y', '1h'),
    ]);
    return { weekly: w.candles, daily: d.candles, hourly: h.candles, synthetic: false };
  } catch {
    const hourly = syntheticHourly(20000, 0.013);
    return { weekly: bucket(hourly, 7 * 86400), daily: bucket(hourly, 86400), hourly, synthetic: true };
  }
}

function replay(inst: string, s: Series) {
  const fourHAll = bucket(s.hourly, 4 * 3600);
  const grades: Record<string, number> = { A: 0, B: 0, C: 0 };
  const lost: Record<string, { label: string; lost: number; n: number }> = {};
  const n = s.daily.length;
  const from = Math.max(45, n - SESSIONS);
  let sessions = 0;
  for (let i = from; i < n; i++) {
    const dayEnd = s.daily[i].time + 86400;
    const weekly = s.weekly.filter((c) => c.time < dayEnd && c.time >= dayEnd - 730 * 86400);
    const daily = s.daily.filter((c) => c.time < dayEnd && c.time >= dayEnd - 365 * 86400);
    const fourH = fourHAll.filter((c) => c.time < dayEnd && c.time >= dayEnd - 90 * 86400);
    if (weekly.length < 10 || daily.length < 45 || fourH.length < 30) continue;
    const lastPrice = daily[daily.length - 1].close;
    const reads: Record<Timeframe, TrendRead> = { Weekly: classify(weekly), Daily: classify(daily), '4H': classify(fourH) };
    const levels: Record<Timeframe, StructureLevels> = {
      Weekly: structureLevels(weekly, reads.Weekly.bias, lastPrice),
      Daily: structureLevels(daily, reads.Daily.bias, lastPrice),
      '4H': structureLevels(fourH, reads['4H'].bias, lastPrice),
    };
    const sug = swingSuggestion(inst, reads, levels.Daily, levels['4H'], lastPrice);
    const setup = swingSetupFromDaily(sug.action, levels.Daily, lastPrice);
    const { components, score } = scoreReadiness({
      symbol: inst,
      now: new Date(dayEnd * 1000),
      reads,
      levels,
      lastPrice,
      dailyCandles: daily,
      fourHCandles: fourH,
      swingSetup: setup,
      newestBar: null,
      events: [],
    });
    grades[gradeFor(score)]++;
    sessions++;
    for (const c of components as ReadinessComponent[]) {
      const row = lost[c.key] ?? { label: c.key, lost: 0, n: 0 };
      row.lost += c.max - c.points;
      row.n++;
      lost[c.key] = row;
    }
  }
  const worst = Object.values(lost).sort((a, b) => b.lost - a.lost)[0];
  return { sessions, grades, worst: worst ? `${worst.label} (avg −${(worst.lost / Math.max(1, worst.n)).toFixed(1)} pts)` : '—' };
}

(async () => {
  console.log(`Readiness replay · last ${SESSIONS} sessions · scored conditions only (hard gates assumed open at session close)\n`);
  console.log('instrument  data        sessions   A     B     C    fails most');
  let anyA = false;
  for (const inst of INSTRUMENTS) {
    const symbol = INSTRUMENT_MAP[inst];
    if (!symbol) {
      console.log(`${inst.padEnd(11)} unknown instrument`);
      continue;
    }
    const series = await loadSeries(symbol);
    const r = replay(inst, series);
    if (r.grades.A > 0) anyA = true;
    const pct = (k: string) => `${String(Math.round((100 * r.grades[k]) / Math.max(1, r.sessions))).padStart(3)}%`;
    console.log(`${inst.padEnd(11)} ${(series.synthetic ? 'SYNTHETIC' : 'Yahoo').padEnd(11)} ${String(r.sessions).padStart(5)}    ${pct('A')}  ${pct('B')}  ${pct('C')}  ${r.worst}`);
  }
  if (!anyA) {
    console.log('\nA never appeared — stop for review (see "fails most").');
    process.exitCode = 2;
  }
})();
