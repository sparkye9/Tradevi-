import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubCandles } from '@/lib/finnhub';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { calcAllIndicators } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';

// Seed-based LCG so candles are stable per symbol (not random on every request)
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

const SEED_BASES: Record<string, number> = {
  SPY: 560, QQQ: 480, SQQQ: 9, TQQQ: 65, TSLA: 285, NVDA: 950, AAPL: 215, AMD: 155, PLTR: 22,
};

function generateDemoCandles(symbol: string, period: string): CandleData[] {
  const PERIOD_BARS: Record<string, number> = {
    '1d': 78, '5d': 390, '1mo': 22, '3mo': 66, '6mo': 130, '1y': 252, '2y': 504, '5y': 1260,
  };
  const count = PERIOD_BARS[period] ?? 66;
  const base  = SEED_BASES[symbol] ?? 100;
  const rand  = seededRandom(base * 37 + symbol.charCodeAt(0));
  const now   = Math.floor(Date.now() / 1000);
  const step  = period === '1d' ? 300 : period === '5d' ? 300 : 86400;

  let price = base;
  const candles: CandleData[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const change = (rand() - 0.495) * base * 0.018;
    const open   = price;
    price = Math.max(price + change, base * 0.4);
    const hi = Math.max(open, price) * (1 + rand() * 0.006);
    const lo = Math.min(open, price) * (1 - rand() * 0.006);
    candles.push({
      time: now - i * step,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(hi.toFixed(2)),
      low:  parseFloat(lo.toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: Math.floor(rand() * 40_000_000 + 5_000_000),
    });
  }
  return candles;
}

const VALID_INTERVALS = ['1m','2m','5m','15m','30m','60m','1h','1d','5d','1wk','1mo'];
const VALID_PERIODS   = ['1d','5d','1mo','3mo','6mo','1y','2y','5y'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol   = rawSymbol.toUpperCase();
  const sp       = request.nextUrl.searchParams;
  const period   = VALID_PERIODS.includes(sp.get('period') ?? '')     ? sp.get('period')!   : '3mo';
  const interval = VALID_INTERVALS.includes(sp.get('interval') ?? '') ? sp.get('interval')! : '1d';

  // Try Finnhub first (real-time)
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
    } catch {
      // Fall through to Yahoo fallback
    }
  }

  // Yahoo Finance fallback — no API key required (~15-20 min delayed)
  try {
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
          delayNote:  '~15–20 min delayed',
          count:      candles.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // Fall through to demo data
  }

  // Demo fallback — seeded synthetic data so the UI is always functional
  const candles = generateDemoCandles(symbol, period);
  const { indicatorData, analysis } = calcAllIndicators(candles);
  return NextResponse.json(
    {
      symbol, period, interval, candles,
      analysis: { ...analysis, indicators: indicatorData },
      meta: {
        dataSource: 'demo',
        fetchedAt:  new Date().toISOString(),
        delayNote:  'Demo data — configure API keys for live prices',
        count:      candles.length,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
