import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubCandles } from '@/lib/finnhub';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { calcAllIndicators } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';

const VALID_INTERVALS = ['1m','2m','5m','15m','30m','60m','1h','1d','5d','1wk','1mo'];
const VALID_PERIODS   = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'];

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol   = params.symbol.toUpperCase();
  const sp       = request.nextUrl.searchParams;
  const period   = VALID_PERIODS.includes(sp.get('period') ?? '')    ? (sp.get('period') as string)   : '3mo';
  const interval = VALID_INTERVALS.includes(sp.get('interval') ?? '') ? (sp.get('interval') as string) : '1d';

  try {
    // Try Finnhub first if API key is configured, fall back to Yahoo Finance
    let candles: CandleData[];
    let dataSource: string;
    let delayNote: string;

    if (process.env.FINNHUB_API_KEY) {
      try {
        const result = await fetchFinnhubCandles(symbol, period, interval);
        candles    = result.candles as CandleData[];
        dataSource = result.dataSource;
        delayNote  = 'Real-time via Finnhub';
      } catch (finnhubErr: any) {
        // Finnhub failed — fall through to Yahoo Finance
        console.warn(`Finnhub failed for ${symbol}: ${finnhubErr.message} — falling back to Yahoo Finance`);
        const result = await fetchYahooCandles(symbol, period, interval);
        candles    = result.candles as CandleData[];
        dataSource = result.dataSource;
        delayNote  = '~15–20 min delayed (Yahoo Finance fallback — check FINNHUB_API_KEY)';
      }
    } else {
      const result = await fetchYahooCandles(symbol, period, interval);
      candles    = result.candles as CandleData[];
      dataSource = result.dataSource;
      delayNote  = '~15–20 min delayed via Yahoo Finance (set FINNHUB_API_KEY for real-time)';
    }

    const { indicatorData, analysis } = calcAllIndicators(candles);

    return NextResponse.json(
      {
        symbol, period, interval, candles,
        analysis: { ...analysis, indicators: indicatorData },
        meta: {
          dataSource,
          fetchedAt: new Date().toISOString(),
          delayNote,
          count: candles.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? `Failed to fetch chart data for ${symbol}` },
      { status: 503 }
    );
  }
}
