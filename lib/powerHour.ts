export type Venue = 'Asia' | 'London' | 'New York';

export type SessionName =
  | 'Weekend'
  | 'Maintenance'
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
const HALT_START = 17 * 60; // 5:00 PM
const HALT_END = 18 * 60; // 6:00 PM
const GLOBEX_SUNDAY_OPEN = 18 * 60; // Sunday 6:00 PM
const GLOBEX_FRIDAY_CLOSE = 17 * 60; // Friday 5:00 PM

function etParts(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday ?? '',
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
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

/**
 * CME Globex equity-index hours in America/New_York:
 * Sunday 6:00 PM through Friday 5:00 PM, ~23 hours a day,
 * with a daily maintenance halt 5:00–6:00 PM ET (Mon–Thu).
 * Sessions: Asia, London, New York. Power Hour is 3:00–4:00 PM ET.
 */
export function marketClock(now = new Date()): MarketClock {
  const { weekday, hour, minute } = etParts(now);
  const clock = etClock(now);
  const mins = hour * 60 + minute;

  if (globexClosed(weekday, mins)) {
    return {
      session: 'Weekend',
      venues: [],
      shortLabel: 'WEEKEND',
      tradesOpen: false,
      powerHour: false,
      clock,
      headline: headlineFor('Weekend'),
    };
  }

  if (dailyHalt(weekday, mins)) {
    return {
      session: 'Maintenance',
      venues: [],
      shortLabel: 'HALT',
      tradesOpen: false,
      powerHour: false,
      clock,
      headline: headlineFor('Maintenance'),
    };
  }

  const venues: Venue[] = [];
  if (inWindow(mins, ASIA_START, ASIA_END)) venues.push('Asia');
  if (inWindow(mins, LONDON_START, LONDON_END)) venues.push('London');
  if (inWindow(mins, NY_START, NY_END)) venues.push('New York');

  const powerHour = inWindow(mins, POWER_START, POWER_END);
  const session = sessionLabel(venues, powerHour);

  return {
    session,
    venues,
    shortLabel: shortLabel(session),
    tradesOpen: true,
    powerHour,
    clock,
    headline: headlineFor(session),
  };
}

export const powerHourClock = marketClock;
