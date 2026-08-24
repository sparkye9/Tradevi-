import { etYmd } from './powerHour';

export type CalendarImpact = 'High' | 'Medium' | 'Low' | 'Holiday' | 'Unknown';

export interface CalendarEvent {
  title: string;
  country: string;
  impact: CalendarImpact;
  at: string;
  forecast: string;
  previous: string;
  actual: string;
}

export interface CalendarResult {
  events: CalendarEvent[];
  source: string;
  lastUpdated: string;
  weekNote: string;
  sourceError?: string;
}

export const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const FF_CALENDAR_PAGE = 'https://www.forexfactory.com/calendar';

const SOURCE_LABEL = 'Forex Factory (weekly export)';
const WEEK_NOTE =
  'This week only — Forex Factory’s public weekly JSON, not a live BLS/Fed feed. Actuals show when they include them. Confirm the print on Forex Factory.';

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function impactOf(raw: string): CalendarImpact {
  if (raw === 'High' || raw === 'Medium' || raw === 'Low' || raw === 'Holiday') return raw;
  return 'Unknown';
}

export function parseFfEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = asString(row.title);
  const at = asString(row.date);
  if (!title || !at) return null;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return null;
  return {
    title,
    country: asString(row.country) || '—',
    impact: impactOf(asString(row.impact)),
    at: new Date(ms).toISOString(),
    forecast: asString(row.forecast),
    previous: asString(row.previous),
    actual: asString(row.actual),
  };
}

export function parseFfCalendar(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseFfEvent)
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function etDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function etTimeLabel(iso: string): string {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso)) + ' ET'
  );
}

export function eventPrinted(iso: string, now = new Date()): boolean {
  return new Date(iso).getTime() <= now.getTime();
}

export function upcomingHighImpact(events: CalendarEvent[], now = new Date(), limit = 5): CalendarEvent[] {
  const t = now.getTime();
  return events
    .filter((e) => e.impact === 'High' && new Date(e.at).getTime() >= t - 30 * 60 * 1000)
    .slice(0, limit);
}

export function groupByEtDay(events: CalendarEvent[]): { key: string; label: string; events: CalendarEvent[] }[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = etYmd(new Date(e.at));
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, dayEvents]) => ({
    key,
    label: etDayLabel(dayEvents[0].at),
    events: dayEvents,
  }));
}

let cache: { data: CalendarResult; ts: number } | null = null;
const TTL = 15 * 60_000;

export async function fetchEconomicCalendar(): Promise<CalendarResult> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  const lastUpdated = new Date().toISOString();
  try {
    const res = await fetch(FF_CALENDAR_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Tradevi/3.0)' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        events: [],
        source: SOURCE_LABEL,
        lastUpdated,
        weekNote: WEEK_NOTE,
        sourceError: `Forex Factory export returned ${res.status}`,
      };
    }
    const json: unknown = await res.json();
    const events = parseFfCalendar(json);
    if (events.length === 0) {
      return {
        events: [],
        source: SOURCE_LABEL,
        lastUpdated,
        weekNote: WEEK_NOTE,
        sourceError: 'Forex Factory export was empty or unreadable',
      };
    }
    const data: CalendarResult = {
      events,
      source: SOURCE_LABEL,
      lastUpdated,
      weekNote: WEEK_NOTE,
    };
    cache = { data, ts: Date.now() };
    return data;
  } catch {
    return {
      events: [],
      source: SOURCE_LABEL,
      lastUpdated,
      weekNote: WEEK_NOTE,
      sourceError: 'Could not reach the Forex Factory weekly export',
    };
  }
}
