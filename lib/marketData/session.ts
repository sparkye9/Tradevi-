/**
 * US cash-equity session calendar (NYSE / Nasdaq), America/New_York.
 *
 *   Pre-market   4:00 AM – 9:30 AM ET
 *   Regular      9:30 AM – 4:00 PM ET   (1:00 PM on early-close days)
 *   After-hours  4:00 PM – 8:00 PM ET   (until 5:00 PM on early-close days)
 *   Closed       otherwise, weekends, and observed exchange holidays
 *
 * Daylight saving time is handled by doing every wall-clock conversion
 * through Intl with the America/New_York zone — no fixed UTC offsets.
 * Holidays and early closes come from lib/marketHolidays.ts (a reviewed
 * table, not a live exchange feed).
 */
import { earlyCloseOn, isUsCashHoliday } from '../marketHolidays';

export type EquitySession = 'PRE' | 'REGULAR' | 'POST' | 'CLOSED';

export interface EquitySessionInfo {
  session: EquitySession;
  /** New York calendar date of `now`. */
  todayEt: string;
  /** Is `todayEt` an exchange trading day? */
  tradingDay: boolean;
  /** Minutes after midnight ET. */
  minutesEt: number;
  /** Regular-session open/close in minutes after midnight ET for today (null on non-trading days). */
  openMin: number | null;
  closeMin: number | null;
  earlyClose: boolean;
  /** Minutes since today's regular open while REGULAR, else null. */
  minutesIntoRegular: number | null;
  /** The most recent trading day whose regular session has finished. */
  lastCompletedSession: string;
  /** Today while REGULAR; otherwise the last completed session. The session today's quotes belong to. */
  referenceSession: string;
  label: string;
}

const PRE_OPEN = 4 * 60;
const REG_OPEN = 9 * 60 + 30;
const REG_CLOSE = 16 * 60;
const EARLY_CLOSE = 13 * 60;
const POST_CLOSE = 20 * 60;
const EARLY_POST_CLOSE = 17 * 60;

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** New York wall-clock parts for an instant. */
export function etWallClock(d: Date): { ymd: string; minutes: number } {
  const p = Object.fromEntries(ET_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
}

export function isEquityTradingDay(ymd: string): boolean {
  const wd = weekdayOf(ymd);
  return wd !== 0 && wd !== 6 && !isUsCashHoliday(ymd);
}

export function regularCloseMinutes(ymd: string): number {
  return earlyCloseOn(ymd) ? EARLY_CLOSE : REG_CLOSE;
}

export function previousTradingDay(ymd: string): string {
  let d = addDays(ymd, -1);
  for (let i = 0; i < 15 && !isEquityTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

/** Number of trading days strictly after `from` up to and including `to`. */
export function tradingDaysBetween(from: string, to: string): number {
  if (from >= to) return 0;
  let n = 0;
  let d = from;
  for (let i = 0; i < 400 && d < to; i++) {
    d = addDays(d, 1);
    if (isEquityTradingDay(d)) n++;
  }
  return n;
}

export function equitySession(now: Date = new Date()): EquitySessionInfo {
  const { ymd, minutes } = etWallClock(now);
  const tradingDay = isEquityTradingDay(ymd);
  const early = tradingDay && Boolean(earlyCloseOn(ymd));
  const closeMin = tradingDay ? (early ? EARLY_CLOSE : REG_CLOSE) : null;
  const postClose = early ? EARLY_POST_CLOSE : POST_CLOSE;

  let session: EquitySession = 'CLOSED';
  if (tradingDay && closeMin !== null) {
    if (minutes >= PRE_OPEN && minutes < REG_OPEN) session = 'PRE';
    else if (minutes >= REG_OPEN && minutes < closeMin) session = 'REGULAR';
    else if (minutes >= closeMin && minutes < postClose) session = 'POST';
  }

  const finishedToday = tradingDay && closeMin !== null && minutes >= closeMin;
  const lastCompletedSession = finishedToday ? ymd : previousTradingDay(ymd);
  const referenceSession = session === 'REGULAR' ? ymd : lastCompletedSession;

  const label =
    session === 'REGULAR'
      ? early
        ? 'Regular session (early close 1:00 PM ET)'
        : 'Regular session'
      : session === 'PRE'
      ? 'Pre-market — regular session not open yet'
      : session === 'POST'
      ? 'After-hours — regular session closed'
      : !tradingDay
      ? isUsCashHoliday(ymd)
        ? 'Exchange holiday — US stock market closed'
        : 'Weekend — US stock market closed'
      : 'Overnight — US stock market closed';

  return {
    session,
    todayEt: ymd,
    tradingDay,
    minutesEt: minutes,
    openMin: tradingDay ? REG_OPEN : null,
    closeMin,
    earlyClose: early,
    minutesIntoRegular: session === 'REGULAR' ? minutes - REG_OPEN : null,
    lastCompletedSession,
    referenceSession,
    label,
  };
}
