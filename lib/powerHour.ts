import { holidayOn } from './marketHolidays';

export type Venue = 'Asia' | 'London' | 'New York';

export type SessionName =
  | 'Weekend'
  | 'Maintenance'
  | 'Holiday'
  | 'Asia'
  | 'Asia / London'
  | 'London'
  | 'London / New York'
  | 'New York'
  | 'New York · Power Hour';

export interface MarketClock {
  session: SessionName;
  venues: Venue[];
  shortLabel: string;
  tradesOpen: boolean;
  powerHour: boolean;
  /** US cash session 9:30 AM–4:00 PM ET on a non-holiday weekday. */
  cashOpen: boolean;
  holidayName: string | null;
  clock: string;
  headline: string;
}

/** Desk windows in America/New_York. Overlaps are real (Asia/London, London/NY). */
export const SESSION_HOURS: { venue: Venue | 'Power Hour'; hours: string }[] = [
  { venue: 'Asia', hours: '6:00 PM – 4:00 AM ET' },
  { venue: 'London', hours: '3:00 AM – 12:00 PM ET' },
  { venue: 'New York', hours: '8:00 AM – 5:00 PM ET' },
  { venue: 'Power Hour', hours: '3:00 PM – 4:00 PM ET' },
];

const ASIA_START = 18 * 60; // 6:00 PM
const ASIA_END = 4 * 60; // 4:00 AM
const LONDON_START = 3 * 60; // 3:00 AM
const LONDON_END = 12 * 60; // 12:00 PM
const NY_START = 8 * 60; // 8:00 AM
const NY_END = 17 * 60; // 5:00 PM
const POWER_START = 15 * 60; // 3:00 PM
const POWER_END = 16 * 60; // 4:00 PM
const CASH_START = 9 * 60 + 30; // 9:30 AM
const CASH_END = 16 * 60; // 4:00 PM
const HALT_START = 17 * 60; // 5:00 PM
const HALT_END = 18 * 60; // 6:00 PM
const GLOBEX_SUNDAY_OPEN = 18 * 60; // Sunday 6:00 PM
const GLOBEX_FRIDAY_CLOSE = 17 * 60; // Friday 5:00 PM

function etParts(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday ?? '',
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function etYmd(now = new Date()): string {
  return etParts(now).ymd;
}

function etClock(now: Date): string {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now) + ' ET'
  );
}

/** Inclusive start, exclusive end. start > end wraps midnight. */
function inWindow(mins: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

function globexClosed(weekday: string, mins: number): boolean {
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun') return mins < GLOBEX_SUNDAY_OPEN;
  if (weekday === 'Fri') return mins >= GLOBEX_FRIDAY_CLOSE;
  return false;
}

function dailyHalt(weekday: string, mins: number): boolean {
  if (weekday === 'Sat' || weekday === 'Sun' || weekday === 'Fri') return false;
  return inWindow(mins, HALT_START, HALT_END);
}

function sessionLabel(venues: Venue[], powerHour: boolean): SessionName {
  const asia = venues.includes('Asia');
  const london = venues.includes('London');
  const ny = venues.includes('New York');
  if (ny && powerHour) return 'New York · Power Hour';
  if (london && ny) return 'London / New York';
  if (asia && london) return 'Asia / London';
  if (ny) return 'New York';
  if (london) return 'London';
  return 'Asia';
}

function shortLabel(session: SessionName): string {
  switch (session) {
    case 'Weekend':
      return 'WEEKEND';
    case 'Maintenance':
      return 'HALT';
    case 'Holiday':
      return 'HOLIDAY';
    case 'Asia':
      return 'ASIA';
    case 'Asia / London':
      return 'ASIA+LDN';
    case 'London':
      return 'LONDON';
    case 'London / New York':
      return 'LDN+NY';
    case 'New York':
      return 'NEW YORK';
    case 'New York · Power Hour':
      return 'POWER HOUR';
  }
}

function headlineFor(session: SessionName): string {
  switch (session) {
    case 'Weekend':
      return 'Weekend — Globex closed until Sunday 6:00 PM ET.';
    case 'Maintenance':
      return 'Daily halt — Globex paused 5:00–6:00 PM ET.';
    case 'Holiday':
      return 'Exchange holiday — CME equity-index futures closed.';
    case 'Asia':
      return 'Asia session — Globex open.';
    case 'Asia / London':
      return 'Asia / London overlap — Globex open.';
    case 'London':
      return 'London session — Globex open.';
    case 'London / New York':
      return 'London / New York overlap — Globex open.';
    case 'New York':
      return 'New York session — Globex open. Power Hour is 3:00–4:00 PM ET.';
    case 'New York · Power Hour':
      return 'New York · Power Hour — last hour of the cash session. Globex still open.';
  }
}

function closedClock(
  now: Date,
  session: Extract<SessionName, 'Weekend' | 'Maintenance' | 'Holiday'>,
  holidayName: string | null,
  headline?: string,
): MarketClock {
  return {
    session,
    venues: [],
    shortLabel: shortLabel(session),
    tradesOpen: false,
    powerHour: false,
    cashOpen: false,
    holidayName,
    clock: etClock(now),
    headline: headline ?? headlineFor(session),
  };
}

/**
 * CME Globex equity-index hours in America/New_York:
 * Sunday 6:00 PM through Friday 5:00 PM, ~23 hours a day,
 * with a daily maintenance halt 5:00–6:00 PM ET (Mon–Thu).
 * Sessions: Asia, London, New York. Power Hour is 3:00–4:00 PM ET
 * on a US cash session day. Holiday dates are observed NYSE/CME
 * calendar days, not a live exchange feed.
 */
export function marketClock(now = new Date()): MarketClock {
  const { weekday, hour, minute, ymd } = etParts(now);
  const clock = etClock(now);
  const mins = hour * 60 + minute;
  const holiday = holidayOn(ymd);
  const cashHoliday = Boolean(holiday);
  const weekdayCash = weekday !== 'Sat' && weekday !== 'Sun';

  if (holiday?.kind === 'cme_closed') {
    return closedClock(
      now,
      'Holiday',
      holiday.name,
      `${holiday.name} — CME equity-index futures closed. Observed calendar date, not a live exchange feed.`,
    );
  }

  if (globexClosed(weekday, mins)) {
    return closedClock(now, 'Weekend', holiday?.name ?? null);
  }

  if (dailyHalt(weekday, mins)) {
    return closedClock(
      now,
      'Maintenance',
      holiday?.name ?? null,
      cashHoliday
        ? `Daily halt — Globex paused 5:00–6:00 PM ET. US cash closed (${holiday!.name}).`
        : headlineFor('Maintenance'),
    );
  }

  const venues: Venue[] = [];
  if (inWindow(mins, ASIA_START, ASIA_END)) venues.push('Asia');
  if (inWindow(mins, LONDON_START, LONDON_END)) venues.push('London');
  if (inWindow(mins, NY_START, NY_END)) venues.push('New York');

  const powerHour = !cashHoliday && inWindow(mins, POWER_START, POWER_END);
  const cashOpen = !cashHoliday && weekdayCash && inWindow(mins, CASH_START, CASH_END);
  const session = sessionLabel(venues, powerHour);
  let headline = headlineFor(session);
  if (cashHoliday && holiday) {
    headline = `${session} — Globex open. US cash closed (${holiday.name}). Power Hour is off.`;
  }

  return {
    session,
    venues,
    shortLabel: shortLabel(session),
    tradesOpen: true,
    powerHour,
    cashOpen,
    holidayName: holiday?.name ?? null,
    clock,
    headline,
  };
}

export const powerHourClock = marketClock;

export type FlowVenue = Venue | 'Power Hour';

export function sessionFlow(clock: MarketClock): { venue: FlowVenue; hours: string; active: boolean }[] {
  return SESSION_HOURS.map((row) => ({
    venue: row.venue,
    hours: row.hours,
    active: row.venue === 'Power Hour' ? clock.powerHour : clock.venues.includes(row.venue as Venue),
  }));
}
