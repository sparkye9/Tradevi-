import { NextRequest, NextResponse } from 'next/server';
import { fetchTwelveChart } from '@/lib/twelveData';
import { fetchFinnhubCandles } from '@/lib/finnhub';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { calcAllIndicators, buildAnalysis } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';
import type { IndicatorData } from '@/lib/apiClient';
import type { TDIndicators } from '@/lib/twelveData';

const VALID_INTERVALS = ['1m','2m','5m','15m','30m','60m','1h','1d','5d','1wk','1mo'];
const VALID_PERIODS   = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'];

// Override base client-computed indicators with TD's authoritative values
// where TD returned data; leave client fallbacks for anything TD didn't cover.
function mergeTD(base: IndicatorData, td: TDIndicators): IndicatorData {
  const has = (arr: (number | null)[]) => arr.some(v => v !== null);
  return {
    ...base,
    ...(has(td.rsi)        && { rsi:        td.rsi        }),
    ...(has(td.ema20)      && { ema20:      td.ema20      }),
    ...(has(td.ema50)      && { ema50:      td.ema50      }),
    ...(has(td.macdLine)   && { macdLine:   td.macdLine   }),
    ...(has(td.macdSignal) && { macdSignal: td.macdSignal }),
    ...(has(td.macdHist)   && { macdHist:   td.macdHist   }),
    ...(has(td.vwap)       && { vwap:       td.vwap       }),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const symbol   = params.symbol.toUpperCase();
  const sp       = request.nextUrl.searchParams;
  const period   = VALID_PERIODS.includes(sp.get('period') ?? '')     ? sp.get('period')!   : '3mo';
  const interval = VALID_INTERVALS.includes(sp.get('interval') ?? '') ? sp.get('interval')! : '1d';

  try {
    // ── 1. Twelve Data — primary provider ──────────────────────────────────
    if (process.env.TWELVE_DATA_API_KEY) {
      try {
        const td = await fetchTwelveChart(symbol, period, interval);

        // Compute everything client-side first (ema9/200, bb, supertrend, aroon, …)
        // then overlay with TD's authoritative RSI, EMA20/50, MACD, VWAP.
        const { indicatorData } = calcAllIndicators(td.candles);
        const merged   = mergeTD(indicatorData, td.tdIndicators);
        const analysis = buildAnalysis(td.candles, merged);

        return NextResponse.json(
          {
            symbol, period, interval,
            candles: td.candles,
            analysis: { ...analysis, indicators: merged },
            meta: {
              dataSource: 'twelve_data',
              fetchedAt:  new Date().toISOString(),
              delayNote:  'Real-time via Twelve Data',
              count:      td.candles.length,
            },
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      } catch (tdErr: unknown) {
        console.warn(
          `Twelve Data failed for ${symbol}: ${tdErr instanceof Error ? tdErr.message : tdErr} — trying Finnhub`,
        );
      }
    }

    // ── 2. Finnhub — secondary provider ────────────────────────────────────
    if (process.env.FINNHUB_API_KEY) {
      try {
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
      } catch (fhErr: unknown) {
        console.warn(
          `Finnhub failed for ${symbol}: ${fhErr instanceof Error ? fhErr.message : fhErr} — falling back to Yahoo Finance`,
        );
      }
    }

    // ── 3. Yahoo Finance — last resort, ~15-20 min delayed ─────────────────
    const result  = await fetchYahooCandles(symbol, period, interval);
    const candles = result.candles as CandleData[];
    const { indicatorData, analysis } = calcAllIndicators(candles);

    return NextResponse.json(
      {
        symbol, period, interval, candles,
        analysis: { ...analysis, indicators: indicatorData },
        meta: {
          dataSource: 'yahoo_delayed',
          fetchedAt:  new Date().toISOString(),
          delayNote:  '~15–20 min delayed via Yahoo Finance',
          count:      candles.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `Failed to fetch chart data for ${symbol}`;
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
