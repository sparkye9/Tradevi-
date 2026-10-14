/** Databento CSV parser + intraday Power Hour backtest checks (called from check-trading.ts). */
import { parseDatabentoCsv, parseTs, aggregateMinutes } from '../lib/databentoCsv';
import { backtestPowerHour } from '../lib/powerHourBacktest';
import { sessionStamp } from '../lib/structure';
import type { Candle } from '../lib/indicators';

export function runSection(check: (name: string, cond: boolean) => void): void {
  // ─── Timestamps ───────────────────────────────────────────────────────────
  check('databento ts: ISO with nanoseconds', parseTs('2026-10-05T13:30:00.000000000Z') === Date.UTC(2026, 9, 5, 13, 30) / 1000);
  check('databento ts: epoch nanoseconds', parseTs('1791207000000000000') === 1791207000);

  // ─── CSV variants ─────────────────────────────────────────────────────────
  const pretty = 'ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol\n' +
    '2026-10-05T13:30:00.000000000Z,33,1,42,21000.25,21002.00,20999.50,21001.75,120,MNQZ6\n' +
    '2026-10-05T13:31:00.000000000Z,33,1,42,21001.75,21003.00,21001.00,21002.50,80,MNQZ6\n' +
    'garbage,row\n';
  const p = parseDatabentoCsv(pretty);
  check('databento csv: decimal prices parsed, malformed row skipped', p.bars.length === 2 && p.bars[0].close === 21001.75 && p.skipped === 1);
  const fixed = 'ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol\n' +
    '1791207000000000000,33,1,42,21000250000000,21002000000000,20999500000000,21001750000000,120,MNQZ6\n';
  check('databento csv: 1e-9 fixed-point prices scaled', parseDatabentoCsv(fixed).bars[0].high === 21002);
  // Two contracts: Z6 has more volume on day 1, H7 on day 2 → volume roll.
  const multi = 'ts_event,open,high,low,close,volume,symbol\n' +
    '2026-12-10T15:00:00Z,100,101,99,100,500,MNQZ6\n2026-12-10T15:00:00Z,101,102,100,101,50,MNQH7\n' +
    '2026-12-11T15:00:00Z,100,101,99,100,40,MNQZ6\n2026-12-11T15:00:00Z,102,103,101,102,900,MNQH7\n';
  const m = parseDatabentoCsv(multi);
  check('databento csv: multi-contract file rolls to the highest-volume contract per session', m.bars.length === 2 && m.bars[0].close === 100 && m.bars[1].close === 102 && m.rollLog.length === 2);
  let threw = false;
  try { parseDatabentoCsv('date,price\n2026-01-01,1\n'); } catch { threw = true; }
  check('databento csv: a non-OHLCV file is rejected, not guessed', threw);

  // ─── Aggregation ──────────────────────────────────────────────────────────
  const ones: Candle[] = [0, 1, 2, 3, 4, 5].map((i) => ({ time: 1791207000 + i * 60, open: 10 + i, high: 11 + i, low: 9 + i, close: 10.5 + i, volume: 1 }));
  const fives = aggregateMinutes(ones, 5);
  check('1m → 5m: OHLCV folded correctly, clock-aligned', fives.length === 2 && fives[0].open === 10 && fives[0].high === 15 && fives[0].low === 9 && fives[0].close === 14.5 && fives[0].volume === 5);

  // ─── Intraday backtest invariants (seeded random walk, 40 sessions) ───────
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const bars: Candle[] = [];
  let px = 20000;
  for (let d = 0; d < 56; d++) {
    const day = new Date(Date.UTC(2026, 6, 1 + d));
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const drift = (rnd() - 0.45) * 0.6;
    for (let k = 0; k < 390; k++) {
      const t = Date.UTC(2026, 6, 1 + d, 13, 30) / 1000 + k * 60; // 09:30–16:00 EDT
      const o = px;
      px = Math.max(100, px + drift + (rnd() - 0.5) * 6);
      bars.push({ time: t, open: o, high: Math.max(o, px) + rnd() * 2, low: Math.min(o, px) - rnd() * 2, close: px, volume: 100 + Math.floor(rnd() * 50) });
    }
  }
  const res = backtestPowerHour({ instrument: 'MNQ', bars1m: bars, feesRoundTrip: 1.24, slippageTicks: 1 });
  check('PH backtest: one outcome per session', res.days.length === res.sessions && res.sessions > 30);
  check('PH backtest: July 3 2026 (holiday observed) skipped', res.days.find((x) => x.date === '2026-07-03')?.outcome === 'skipped_calendar');
  check('PH backtest: at most one trade per day', new Set(res.trades.map((t) => t.date)).size === res.trades.length);
  check('PH backtest: entries only inside 14:38–14:45 ET', res.trades.every((t) => { const m2 = sessionStamp(Date.parse(t.entryTime) / 1000).etMins; return m2 > 14 * 60 + 38 && m2 <= 14 * 60 + 45; }));
  check('PH backtest: exits by 15:20 ET', res.trades.every((t) => sessionStamp(Date.parse(t.exitTime) / 1000).etMins <= 15 * 60 + 20));
  check('PH backtest: stopped trades lose, target trades win', res.trades.every((t) => (t.exitReason === 'stop' ? t.r < 0 : t.exitReason === 'target' ? t.r > 0 : true)));
  check('PH backtest: every trade had ≥ 1.5R to target from the actual entry', res.trades.every((t) => Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop) >= 1.5 - 1e-9));
  check('PH backtest: rule-failure counts only cover non-traded days', Object.values(res.ruleFailures).every((n) => n <= res.days.filter((x) => x.outcome !== 'traded').length));
  check('PH backtest: news rule disclosed as not applied', res.notes.some((n) => /News rule NOT applied/.test(n)));
  console.log(`    (fixture produced ${res.trades.length} trade(s) over ${res.sessions} sessions)`);
}
