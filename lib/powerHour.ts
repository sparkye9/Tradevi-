export type SessionStatus = 'WEEKEND' | 'BEFORE' | 'OPEN' | 'AFTER';

export interface PowerHourClock {
  status: SessionStatus;
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

/** Regular-session last hour: 3:00–4:00 PM America/New_York, weekdays only. */
export function powerHourClock(now = new Date()): PowerHourClock {
  const { weekday, hour, minute } = etParts(now);
  const clock =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now) + ' ET';

  if (weekday === 'Sat' || weekday === 'Sun') {
    return { status: 'WEEKEND', clock, headline: 'NO TRADE — market closed' };
  }

  const mins = hour * 60 + minute;
  const start = 15 * 60;
  const end = 16 * 60;
  if (mins < start) {
    return { status: 'BEFORE', clock, headline: 'NO TRADE yet — Power Hour starts at 3:00 PM ET' };
  }
  if (mins >= end) {
    return { status: 'AFTER', clock, headline: 'NO TRADE — regular session is closed' };
  }
  return { status: 'OPEN', clock, headline: 'Power Hour is open — confirm on TradingView before you act' };
}
