import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { INSTRUMENT_MAP, DISPLAY_INSTRUMENTS } from '@/lib/trendBias';
import { runBacktest, type BacktestResult, type BacktestCosts } from '@/lib/backtest';
import { contractSpec } from '@/lib/contracts';

export const runtime = 'nodejs';

// Cache results for an hour — daily-bar backtests don't change intraday.
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000;
const PERIODS = new Set(['1y', '2y', '5y']);

export async function GET(req: Request) {
  const limited = rateLimit(req, 'backtest', { capacity: 20, perMinute: 10 });
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const instrument = (searchParams.get('instrument') ?? 'ALL').toUpperCase();
  const period = searchParams.get('period') ?? '2y';
  if (!PERIODS.has(period)) {
    return NextResponse.json({ results: [], error: `period must be one of ${Array.from(PERIODS).join(', ')}` }, { status: 400 });
  }
  if (instrument !== 'ALL' && !INSTRUMENT_MAP[instrument]) {
    return NextResponse.json({ results: [], error: `Unknown instrument "${instrument}".` }, { status: 400 });
  }
  const weeklyFilter = searchParams.get('weekly') !== 'off';
  const maxHoldRaw = parseInt(searchParams.get('maxHold') ?? '', 10);
  const maxHold = Number.isFinite(maxHoldRaw) && maxHoldRaw > 0 ? Math.min(maxHoldRaw, 250) : 40;
  const withCosts = searchParams.get('costs') === 'on';
  const fees = Math.max(0, Math.min(100, Number(searchParams.get('fees') ?? '1.5') || 0));
  const slip = Math.max(0, Math.min(20, Math.round(Number(searchParams.get('slip') ?? '1') || 0)));

  const key = `${instrument}:${period}:${weeklyFilter}:${maxHold}:${withCosts}:${fees}:${slip}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data);

  const targets = instrument === 'ALL' ? [...DISPLAY_INSTRUMENTS] : [instrument];

  const results: BacktestResult[] = [];
  for (const inst of targets) {
    const symbol = INSTRUMENT_MAP[inst];
    if (!symbol) continue;
    // Costs are priced on the contract the desk trades (micro where one exists).
    const costs: BacktestCosts | undefined =
      withCosts && contractSpec(inst) ? { contract: inst, feesRoundTrip: fees, slippageTicks: slip } : undefined;
    try {
      const { candles } = await fetchYahooCandles(symbol, period, '1d');
      results.push(runBacktest({ instrument: inst, dataSymbol: symbol, candles, useWeeklyFilter: weeklyFilter, maxBarsInTrade: maxHold, costs }));
    } catch (err) {
      const r = runBacktest({ instrument: inst, dataSymbol: symbol, candles: [], maxBarsInTrade: maxHold });
      results.push({ ...r, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const payload = {
    results,
    period,
    weeklyFilter,
    maxHold,
    costs: withCosts ? { fees, slip } : null,
    source: 'Yahoo Finance daily candles (continuous front-month, delayed)',
    lastUpdated: new Date().toISOString(),
  };
  if (cache.size > 50) cache.clear();
  cache.set(key, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}
