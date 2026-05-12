import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubCandles } from '@/lib/finnhub';
import { calcAllIndicators, buildAnalysis } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';
import type { IndicatorData } from '@/lib/apiClient';

const VALID_INTERVALS = ['1m','2m','5m','15m','30m','60m','1h','1d','5d','1wk','1mo'];
const VALID_PERIODS   = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'];

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol   = params.symbol.toUpperCase();
  const sp       = request.nextUrl.searchParams;
  const period   = VALID_PERIODS.includes(sp.get('period') ?? '')     ? sp.get('period')!   : '3mo';
  const interval = VALID_INTERVALS.includes(sp.get('interval') ?? '') ? sp.get('interval')! : '1d';

  try {
    if (!process.env.FINNHUB_API_KEY) {
      return NextResponse.json(
        { error: 'Market data unavailable — API key required' },
        { status: 503 },
      );
    }

    const result  = await fetchFinnhubCandles(symbol, period, interval);
    const candles = result.candles as CandleData[];
    const { indicatorData, analysis } = calcAllIndicators(candles);

    return NextResponse.json(
      {
        symbol, period, interval, candles,
        analysis: { ...analysis, indicators: indicatorData },
        meta: {
          dataSource: 'finnhub_realtime',
          fetchedAt:  new Date().toISOString(),
          delayNote:  'Real-time via Finnhub',
          count:      candles.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Market data unavailable — API key required' },
      { status: 503 },
    );
  }
}
