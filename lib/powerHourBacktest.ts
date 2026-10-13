/**
 * Intraday replay of the futures Power Hour engine on 1-minute bars
 * (e.g. Databento ohlcv-1m). For each session it runs the SAME powerHour()
 * function the live page uses, at every 5-minute close inside the entry
 * window, with only the bars that existed at that moment.
 *
 * Execution rules (conservative, listed in `notes`):
 *  - Entry: market at the close of the 5m confirmation bar (+ slippage ticks).
 *  - Management on 1-minute bars from the next minute: a minute that touches
 *    both stop and target counts as the stop.
 *  - Exit: stop, target, or flat at the close of the last 1-minute bar that
 *    ends by the exit-window end (time exit, + slippage ticks).
 *  - One trade per day at most.
 *  - News: historical economic calendars are not available here, so the news
 *    rule is NOT applied unless you pass events. Results therefore include
 *    days the live engine would have skipped for CPI / FOMC.
 */
import type { Candle } from './indicators';
import { aggregateMinutes } from './databentoCsv';
import { powerHour, DEFAULT_POWER_HOUR, type PowerHourConfig } from './powerHourEngine';
import { sessionStamp } from './structure';
import { holidayOn, earlyCloseOn } from './marketHolidays';
import { contractSpec } from './contracts';
import { statsFor, MIN_MEANINGFUL_TRADES, type StrategyStats } from './backtest';
import type { CalendarEvent } from './economicCalendar';

export interface PhTrade {
  date: string;
  direction: 'long' | 'short';
  entryTime: string;
  entry: number;
  stop: number;
  target: number;
  exitTime: string;
  exit: number;
  exitReason: 'stop' | 'target' | 'time';
  r: number;
  pnlPerContract: number;
}

export interface PhDay {
  date: string;
  outcome: 'traded' | 'no_trade' | 'candidate_unconfirmed' | 'no_data' | 'skipped_calendar';
  failed: string[];
}

export interface PhBacktestResult {
  instrument: string;
  from: string | null;
  to: string | null;
  sessions: number;
  days: PhDay[];
  trades: PhTrade[];
  stats: StrategyStats;
  inSample: StrategyStats;
  outOfSample: StrategyStats;
  splitDate: string | null;
  monthly: { month: string; trades: number; totalR: number; pnl: number }[];
  /** How often each rule blocked a trade (days where it failed). */
  ruleFailures: Record<string, number>;
  netPerContract: number;
  sampleWarning: string | null;
  notes: string[];
}

const HISTORY_5M = 2400;
const HISTORY_15M = 800;

function lastIndexAtOrBefore(bars: Candle[], t: number): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

const iso = (sec: number) => new Date(sec * 1000).toISOString();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function backtestPowerHour(opts: {
  instrument: string;
  bars1m: Candle[];
  cfg?: PowerHourConfig;
  feesRoundTrip?: number;
  slippageTicks?: number;
  events?: CalendarEvent[];
}): PhBacktestResult {
  const cfg = opts.cfg ?? DEFAULT_POWER_HOUR;
  const spec = contractSpec(opts.instrument);
  const tick = spec?.tickSize ?? 0.25;
  const pv = spec?.pointValue ?? 1;
  const fees = opts.feesRoundTrip ?? 0;
  const slip = (opts.slippageTicks ?? 0) * tick;
  const m1 = [...opts.bars1m].sort((a, b) => a.time - b.time);
  const m5 = aggregateMinutes(m1, 5);
  const m15 = aggregateMinutes(m1, 15);
  const events = opts.events ?? [];

  // Weekday session dates that have RTH bars.
  const sessions = Array.from(new Set(m5.filter((b) => { const s = sessionStamp(b.time); return s.etMins >= 570 && s.etMins < 960; }).map((b) => sessionStamp(b.time).session))).sort();

  const days: PhDay[] = [];
  const trades: PhTrade[] = [];
  const ruleFailures: Record<string, number> = {};

  for (const date of sessions) {
    if (holidayOn(date) || earlyCloseOn(date)) { days.push({ date, outcome: 'skipped_calendar', failed: ['session'] }); continue; }
    // 5m bars of this date whose CLOSE falls inside the entry window.
    const checks = m5.filter((b) => {
      const s = sessionStamp(b.time + 300);
      return s.session === date && s.etMins > cfg.entryStart && s.etMins <= cfg.entryEnd;
    });
    if (!checks.length) { days.push({ date, outcome: 'no_data', failed: ['data'] }); continue; }

    let traded = false;
    let lastFailed: string[] = [];
    let sawCandidate = false;
    for (const cb of checks) {
      const nowSec = cb.time + 300;
      const i5 = lastIndexAtOrBefore(m5, cb.time);
      const i15 = lastIndexAtOrBefore(m15, nowSec - 900);
      const res = powerHour({
        instrument: opts.instrument,
        bars5m: m5.slice(Math.max(0, i5 - HISTORY_5M + 1), i5 + 1),
        bars15m: i15 >= 0 ? m15.slice(Math.max(0, i15 - HISTORY_15M + 1), i15 + 1) : [],
        now: new Date(nowSec * 1000),
        events,
        calendarAvailable: true,
        cfg,
      });
      lastFailed = res.rules.filter((r) => r.passed !== true).map((r) => r.key);
      if (res.status === 'CANDIDATE') sawCandidate = true;
      if (res.status !== 'CONFIRMED' || !res.plan || !res.direction) continue;

      // Enter at the confirmation bar close.
      const dir = res.direction;
      const entry = dir === 'long' ? cb.close + slip : cb.close - slip;
      const { stop, target } = res.plan;
      const risk = Math.abs(entry - stop);
      if (risk <= 0 || (dir === 'long' ? stop >= entry || target <= entry : stop <= entry || target >= entry)) continue;
      // After entry slippage the reward must still clear the minimum.
      if (Math.abs(target - entry) / risk < cfg.minRR) continue;

      const exitEndSec = nowSec + (cfg.exitEnd - sessionStamp(nowSec).etMins) * 60;
      let exit = NaN, exitT = nowSec, reason: PhTrade['exitReason'] = 'time';
      let lastClose = cb.close, lastT = nowSec;
      for (let j = lastIndexAtOrBefore(m1, nowSec - 1) + 1; j < m1.length; j++) {
        const b = m1[j];
        if (b.time < nowSec) continue;
        if (b.time + 60 > exitEndSec) break;
        const hitStop = dir === 'long' ? b.low <= stop : b.high >= stop;
        const hitTgt = dir === 'long' ? b.high >= target : b.low <= target;
        if (hitStop) { exit = dir === 'long' ? stop - slip : stop + slip; exitT = b.time + 60; reason = 'stop'; break; }
        if (hitTgt) { exit = target; exitT = b.time + 60; reason = 'target'; break; }
        lastClose = b.close; lastT = b.time + 60;
      }
      if (!Number.isFinite(exit)) { exit = dir === 'long' ? lastClose - slip : lastClose + slip; exitT = lastT; }
      const pts = dir === 'long' ? exit - entry : entry - exit;
      const pnl = r2(pts * pv - fees);
      trades.push({
        date, direction: dir, entryTime: iso(nowSec), entry: r2(entry), stop, target,
        exitTime: iso(exitT), exit: r2(exit), exitReason: reason,
        r: r2((pts - fees / pv) / risk), pnlPerContract: pnl,
      });
      traded = true;
      break;
    }
    if (traded) days.push({ date, outcome: 'traded', failed: [] });
    else {
      for (const k of lastFailed) ruleFailures[k] = (ruleFailures[k] ?? 0) + 1;
      days.push({ date, outcome: sawCandidate ? 'candidate_unconfirmed' : 'no_trade', failed: lastFailed });
    }
  }

  const rs = trades.map((t) => t.r);
  const cut = Math.floor(trades.length * 0.7);
  const months = new Map<string, { month: string; trades: number; totalR: number; pnl: number }>();
  for (const t of trades) {
    const m = t.date.slice(0, 7);
    const row = months.get(m) ?? { month: m, trades: 0, totalR: 0, pnl: 0 };
    row.trades++; row.totalR = r2(row.totalR + t.r); row.pnl = r2(row.pnl + t.pnlPerContract);
    months.set(m, row);
  }

  return {
    instrument: opts.instrument,
    from: sessions[0] ?? null,
    to: sessions[sessions.length - 1] ?? null,
    sessions: sessions.length,
    days,
    trades,
    stats: statsFor('Power Hour', rs),
    inSample: statsFor('In-sample (first 70%)', rs.slice(0, cut)),
    outOfSample: statsFor('Out-of-sample (last 30%)', rs.slice(cut)),
    splitDate: trades[cut]?.date ?? null,
    monthly: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    ruleFailures,
    netPerContract: r2(trades.reduce((s, t) => s + t.pnlPerContract, 0)),
    sampleWarning: trades.length < MIN_MEANINGFUL_TRADES ? `Only ${trades.length} trades — too few for the win rate or expectancy to be meaningful.` : null,
    notes: [
      'Same powerHour() rules as the live page, evaluated at each 5-minute close in the entry window with only bars available at that moment.',
      'Entry at the confirmation bar close; a 1-minute bar touching stop and target counts as the stop; otherwise flat by the end of the exit window.',
      `Costs: $${fees} round-trip and ${opts.slippageTicks ?? 0} tick(s) slippage on entry, stops and time exits.`,
      events.length ? `News rule applied with ${events.length} supplied event(s).` : 'News rule NOT applied — no historical calendar. Results include CPI / FOMC days the live engine would skip.',
      'Prices are the contract(s) in your file, not back-adjusted across rolls.',
      'One trade per day. A positive result is not proof of an edge — check sample size and out-of-sample.',
    ],
  };
}
