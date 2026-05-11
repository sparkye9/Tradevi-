import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles } from '@/lib/yahoo';
import { calcAllIndicators } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';

// Yahoo Finance valid intervals
const VALID_INTERVALS = ['1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo'];
const VALID_PERIODS   = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'];

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol   = params.symbol.toUpperCase();
  const sp       = request.nextUrl.searchParams;
  const period   = VALID_PERIODS.includes(sp.get('period') ?? '')   ? (sp.get('period') as string)   : '3mo';
  const interval = VALID_INTERVALS.includes(sp.get('interval') ?? '') ? (sp.get('interval') as string) : '1d';

  try {
    const { candles, dataSource } = await fetchCandles(symbol, period, interval);
    const { indicatorData, analysis } = calcAllIndicators(candles as CandleData[]);

    return NextResponse.json({
      symbol,
      period,
      interval,
      candles,
      analysis: {
        ...analysis,
        indicators: indicatorData,
      },
      meta: {
        dataSource,
        fetchedAt: new Date().toISOString(),
        delayNote: '~15–20 min delayed via Yahoo Finance',
        count: candles.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? `Failed to fetch chart data for ${symbol}` },
      { status: 503 }
    );
  }
}
