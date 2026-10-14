import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { universeBySymbol } from '@/lib/marketUniverse';
import { fetchMultiTimeframe } from '@/lib/intradayData';
import { powerHour, DEFAULT_POWER_HOUR, windowLabel, type PowerHourConfig } from '@/lib/powerHourEngine';
import { highImpactCalendar } from '@/lib/trendBias';

export const runtime = 'nodejs';
export const maxDuration = 30;

function parseHm(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return fallback;
  const h = Number(m[1]), mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : fallback;
}

/** GET /api/power-hour?instrument=MNQ&entry=14:38-14:45&exit=15:15-15:20 */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'power-hour', { capacity: 20, perMinute: 10 });
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const instrument = (searchParams.get('instrument') ?? 'MNQ').toUpperCase();
  const inst = universeBySymbol(instrument);
  if (!inst) return NextResponse.json({ error: `Unknown instrument "${instrument}".` }, { status: 400 });
  const [es, ee] = (searchParams.get('entry') ?? '').split('-');
  const [xs, xe] = (searchParams.get('exit') ?? '').split('-');
  const cfg: PowerHourConfig = {
    ...DEFAULT_POWER_HOUR,
    entryStart: parseHm(es ?? null, DEFAULT_POWER_HOUR.entryStart),
    entryEnd: parseHm(ee ?? null, DEFAULT_POWER_HOUR.entryEnd),
    exitStart: parseHm(xs ?? null, DEFAULT_POWER_HOUR.exitStart),
    exitEnd: parseHm(xe ?? null, DEFAULT_POWER_HOUR.exitEnd),
  };
  if (!(cfg.entryStart < cfg.entryEnd && cfg.entryEnd <= cfg.exitStart && cfg.exitStart < cfg.exitEnd)) {
    return NextResponse.json({ error: 'Window must be in order: entry start < entry end ≤ exit start < exit end.' }, { status: 400 });
  }
  const now = new Date();
  try {
    const [series, calendar] = await Promise.all([fetchMultiTimeframe(inst.yahoo, now, ['15m', '5m']), highImpactCalendar()]);
    const result = powerHour({
      instrument: inst.readinessInstrument,
      bars5m: series['5m']?.bars ?? [],
      bars15m: series['15m']?.bars ?? [],
      now,
      events: calendar.events,
      calendarAvailable: calendar.available,
      cfg,
    });
    return NextResponse.json({
      ...result,
      window: windowLabel(cfg),
      config: cfg,
      source: 'Yahoo Finance 5m / 15m continuous futures (delayed)',
      errors: [series['5m']?.error, series['15m']?.error].filter(Boolean),
      updated_at: now.toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
