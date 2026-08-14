export type SessionName =
  | 'Weekend'
  | 'Closed'
  | 'Premarket'
  | 'Regular hours'
  | 'Power Hour'
  | 'After hours';

export interface MarketClock {
  session: SessionName;
  shortLabel: string;
  tradesOpen: boolean;
  powerHour: boolean;
  clock: string;
  headline: string;
}

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

/**
 * US equity sessions in America/New_York.
 * Cash market (trades open): 9:30 AM–4:00 PM. Power Hour is the last hour of that.
 */
export function marketClock(now = new Date()): MarketClock {
  const { weekday, hour, minute } = etParts(now);
  const clock = etClock(now);
  const mins = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      session: 'Weekend',
      shortLabel: 'WEEKEND',
      tradesOpen: false,
      powerHour: false,
      clock,
      headline: 'Market closed — weekend',
    };
  }

  const preOpen = 4 * 60;
  const cashOpen = 9 * 60 + 30;
  const powerStart = 15 * 60;
  const cashClose = 16 * 60;
  const afterClose = 20 * 60;

  if (mins >= cashOpen && mins < powerStart) {
    return {
      session: 'Regular hours',
      shortLabel: 'REGULAR',
      tradesOpen: true,
      powerHour: false,
      clock,
      headline: 'Regular session — trades open. Power Hour starts at 3:00 PM ET.',
    };
  }

  if (mins >= powerStart && mins < cashClose) {
    return {
      session: 'Power Hour',
      shortLabel: 'POWER HOUR',
      tradesOpen: true,
      powerHour: true,
      clock,
      headline: 'Power Hour — last hour of the cash session. Trades still open.',
    };
  }

  if (mins >= preOpen && mins < cashOpen) {
    return {
      session: 'Premarket',
      shortLabel: 'PREMARKET',
      tradesOpen: false,
      powerHour: false,
      clock,
      headline: 'Premarket — cash session opens at 9:30 AM ET.',
    };
  }

  if (mins >= cashClose && mins < afterClose) {
    return {
      session: 'After hours',
      shortLabel: 'AFTER HOURS',
      tradesOpen: false,
      powerHour: false,
      clock,
      headline: 'After hours — cash session closed at 4:00 PM ET.',
    };
  }

  return {
    session: 'Closed',
    shortLabel: 'CLOSED',
    tradesOpen: false,
    powerHour: false,
    clock,
    headline: 'Market closed',
  };
}

export const powerHourClock = marketClock;
