import { NextResponse } from 'next/server';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { INSTRUMENT_MAP, DISPLAY_INSTRUMENTS } from '@/lib/trendBias';
import { runBacktest, type BacktestResult } from '@/lib/backtest';

export const runtime = 'nodejs';

// Cache results for an hour — daily-bar backtests don't change intraday.
let cache: { key: string; data: unknown; ts: number } | null = null;
const TTL = 60 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const instrument = (searchParams.get('instrument') ?? 'ALL').toUpperCase();
  const period = searchParams.get('period') ?? '2y';
  const weeklyFilter = searchParams.get('weekly') !== 'off';
  const maxHoldRaw = parseInt(searchParams.get('maxHold') ?? '', 10);
  const maxHold = Number.isFinite(maxHoldRaw) && maxHoldRaw > 0 ? maxHoldRaw : 40;

  const key = `${instrument}:${period}:${weeklyFilter}:${maxHold}`;
  if (cache && cache.key === key && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  const targets = instrument === 'ALL'
    ? [...DISPLAY_INSTRUMENTS]
    : [instrument];

  try {
    const results: BacktestResult[] = [];
    for (const inst of targets) {
      const symbol = INSTRUMENT_MAP[inst];
      if (!symbol) continue;
      try {
        const { candles } = await fetchYahooCandles(symbol, period, '1d');
        results.push(runBacktest({ instrument: inst, dataSymbol: symbol, candles, useWeeklyFilter: weeklyFilter, maxBarsInTrade: maxHold }));
      } catch (err) {
        const zero = { trades: 0, wins: 0, losses: 0, winRate: 0, expectancyR: 0, profitFactor: 0, totalR: 0, maxDrawdownR: 0, avgWinR: 0, avgLossR: 0, avgHoldBars: 0, medianHoldBars: 0 };
        results.push({
          instrument: inst, dataSymbol: symbol, bars: 0,
          fromDate: null, toDate: null, signalsGenerated: 0, ordersFilled: 0, fillRate: 0,
          tp1Strategy: { label: 'Exit at TP1', ...zero },
          tp2Strategy: { label: 'Exit at TP2', ...zero },
          hybridStrategy: { label: 'Hybrid (½ TP1 + runner)', ...zero },
          maxHoldBars: maxHold,
          trades: [], notes: [], error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const payload = {
      results,
      period,
      weeklyFilter,
      maxHold,
      source: 'Yahoo Finance daily candles',
      lastUpdated: new Date().toISOString(),
    };
    cache = { key, data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { results: [], error: err instanceof Error ? err.message : String(err), lastUpdated: new Date().toISOString() },
      { status: 200 },
    );
  }
}
