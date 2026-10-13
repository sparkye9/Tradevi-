import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { universeBySymbol } from '@/lib/marketUniverse';
import { fetchMultiTimeframe } from '@/lib/intradayData';
import { analyzeStructure, consolidate, liquidityMap, STRUCTURE_DEFINITIONS, DEFAULT_STRUCTURE_CONFIG, type TfKey, type TimeframeStructure, type Trend } from '@/lib/structure';
import { generateSetups, SCORE_WEIGHTS } from '@/lib/setupEngine';
import { marketClock } from '@/lib/powerHour';
import { highImpactCalendar } from '@/lib/trendBias';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TFS: TfKey[] = ['1D', '4H', '1H', '15m', '5m', '1m'];

/** Trim heavy arrays for the response (the UI shows the latest items only). */
function slim(s: TimeframeStructure) {
  return {
    ...s,
    swings: s.swings.slice(-12),
    externalSwings: s.externalSwings.slice(-8),
    events: s.events.slice(-8),
    fvgs: s.fvgs.filter((f) => f.state === 'unmitigated' || f.state === 'partial').slice(-6),
    fvgCounts: s.fvgs.reduce<Record<string, number>>((m, f) => ((m[f.state] = (m[f.state] ?? 0) + 1), m), {}),
  };
}

/** GET /api/structure?instrument=MNQ&confirm=close|wick */
export async function GET(request: Request) {
  const limited = rateLimit(request, 'structure', { capacity: 15, perMinute: 8 });
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const instrument = (searchParams.get('instrument') ?? 'MNQ').toUpperCase();
  const inst = universeBySymbol(instrument);
  if (!inst) return NextResponse.json({ error: `Unknown instrument "${instrument}".` }, { status: 400 });
  const confirmation = searchParams.get('confirm') === 'wick' ? 'wick' : 'close';
  const cfg = { ...DEFAULT_STRUCTURE_CONFIG, confirmation } as const;
  const now = new Date();

  try {
    const [series, calendar] = await Promise.all([fetchMultiTimeframe(inst.yahoo, now, TFS), highImpactCalendar()]);
    const tf: Partial<Record<TfKey, TimeframeStructure>> = {};
    const reads: Partial<Record<TfKey, Trend | null>> = {};
    const fresh: Partial<Record<TfKey, boolean>> = {};
    for (const k of TFS) {
      const s = series[k];
      if (!s || s.bars.length < 20) { reads[k] = null; continue; }
      tf[k] = analyzeStructure(s.bars, cfg);
      // A stale or missing series does not get a vote.
      reads[k] = s.state === 'stale' ? null : tf[k]!.trend;
      fresh[k] = s.state === 'fresh';
    }
    const mtf = consolidate(reads);
    const htf = consolidate({ '1D': reads['1D'], '4H': reads['4H'], '1H': reads['1H'] });
    const liqBars = series['5m']?.bars.length ? series['5m']!.bars : series['15m']?.bars ?? [];
    const liquidity = liqBars.length ? liquidityMap(liqBars) : null;
    const clock = marketClock(now);
    const instrumentKey = inst.readinessInstrument;
    const setups = generateSetups({
      instrument: instrumentKey,
      now,
      tf,
      bars15m: series['15m']?.bars ?? [],
      bars5m: series['5m']?.bars ?? [],
      liquidity,
      htfBias: htf.bias,
      fresh,
      clock,
      events: calendar.events,
      calendarAvailable: calendar.available,
    });

    return NextResponse.json({
      instrument: instrumentKey,
      dataSymbol: inst.yahoo,
      source: 'Yahoo Finance continuous front-month futures (delayed). Micro contracts use the full-size price series.',
      config: cfg,
      definitions: STRUCTURE_DEFINITIONS,
      scoreWeights: SCORE_WEIGHTS,
      series: Object.fromEntries(TFS.map((k) => {
        const s = series[k];
        return [k, s ? { state: s.state, ageMinutes: s.ageMinutes, newestClose: s.newestClose, bars: s.bars.length, source: s.source, error: s.error } : null];
      })),
      timeframes: Object.fromEntries(Object.entries(tf).map(([k, v]) => [k, slim(v!)])),
      mtf,
      htf,
      liquidity,
      setups,
      clock: { session: clock.session, headline: clock.headline, tradesOpen: clock.tradesOpen },
      calendarAvailable: calendar.available,
      updated_at: now.toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
