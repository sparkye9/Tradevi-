import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';

// ─── Timezone helpers ─────────────────────────────────────────────────────────

function getETOffsetHours(): number {
  const now = new Date();
  const year = now.getFullYear();
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, (mar1Day === 0 ? 8 : 15 - mar1Day));
  const nov1Day = new Date(year, 10, 1).getDay();
  const dstEnd = new Date(year, 10, (nov1Day === 0 ? 1 : 8 - nov1Day));
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function get8amETTimestampForToday(): number {
  const etOffset = getETOffsetHours();
  const now = new Date();
  const utcHour = 8 - etOffset; // 12 during EDT, 13 during EST
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = utcMidnight + utcHour * 3600 * 1000;
  return target > now.getTime()
    ? Math.floor((target - 86400 * 1000) / 1000)
    : Math.floor(target / 1000);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Candle type ──────────────────────────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── TwelveData fetch ─────────────────────────────────────────────────────────

async function fetchTwelveCandles(
  symbol: string,
  fromSec: number,
  tdInterval: '1min' | '5min',
): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not set');

  const etOffset = getETOffsetHours();
  const startDate = new Date((fromSec + etOffset * 3600) * 1000);
  const startStr = startDate.toISOString().slice(0, 16).replace('T', ' ');

  const url = `https://api.twelvedata.com/time_series`
    + `?symbol=${encodeURIComponent(symbol)}`
    + `&interval=${tdInterval}`
    + `&outputsize=60`
    + `&prepost=1`
    + `&start_date=${encodeURIComponent(startStr)}`
    + `&order=ASC`
    + `&apikey=${apiKey}`;

  const res = await yfFetch(url);
  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);

  const json = await res.json();
  if (json.status === 'error') throw new Error(`TwelveData: ${json.message}`);

  const values: { datetime: string; open: string; high: string; low: string; close: string; volume: string }[] =
    json.values ?? [];
  if (!values.length) throw new Error('TwelveData returned no candles');

  return values.map(v => {
    const localMs = new Date(v.datetime.replace(' ', 'T') + ':00').getTime();
    const utcSec  = Math.floor(localMs / 1000) - etOffset * 3600;
    return {
      time:   utcSec,
      open:   parseFloat(v.open)   || 0,
      high:   parseFloat(v.high)   || 0,
      low:    parseFloat(v.low)    || 0,
      close:  parseFloat(v.close)  || 0,
      volume: parseFloat(v.volume) || 0,
    };
  }).filter(c => c.close > 0 && c.high > 0);
}

// ─── Yahoo Finance fallback ───────────────────────────────────────────────────

async function fetchYahooCandles(
  symbol: string,
  fromSec: number,
  interval: '1m' | '5m',
): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${fromSec}&period2=${nowSec}&interval=${interval}&includePrePost=true`;

  const res = await yfFetch(url);
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo Finance returned HTML');

  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? 'No chart data from Yahoo');

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  return timestamps
    .map((ts, i) => ({
      time:   ts,
      open:   q.open?.[i]   ?? 0,
      high:   q.high?.[i]   ?? 0,
      low:    q.low?.[i]    ?? 0,
      close:  q.close?.[i]  ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter(c => c.close > 0 && c.high > 0);
}

// ─── Route handler ────────────────────────────────────────────────────────────

const VALID_TIMEFRAMES = [1, 5, 10, 15, 30] as const;
type Timeframe = typeof VALID_TIMEFRAMES[number];

export async function GET(request: NextRequest) {
  const sp        = request.nextUrl.searchParams;
  const symbol    = sp.get('symbol')?.toUpperCase()?.trim() ?? 'QQQ';
  const tfRaw     = parseInt(sp.get('timeframe') ?? '5', 10);
  const timeframe = (VALID_TIMEFRAMES.includes(tfRaw as Timeframe) ? tfRaw : 5) as Timeframe;

  // Base candle interval: use 1-min for 1-min ORB, 5-min for everything else
  const useMins = timeframe === 1 ? 1 : 5;

  try {
    const target8am = get8amETTimestampForToday();
    const fromSec   = target8am - 2 * 3600;

    // Fetch candles (TwelveData preferred, Yahoo fallback)
    let candles: Candle[];
    let dataSource: string;

    try {
      candles    = await fetchTwelveCandles(symbol, fromSec, useMins === 1 ? '1min' : '5min');
      dataSource = 'twelve_data';
    } catch {
      candles    = await fetchYahooCandles(symbol, fromSec, useMins === 1 ? '1m' : '5m');
      dataSource = 'yahoo_delayed';
    }

    if (candles.length === 0) {
      throw new Error('No valid candles — market may be closed or symbol invalid');
    }

    // Collect candles that fall within the ORB window: [8:00am, 8:00am + timeframe mins)
    const windowEnd = target8am + timeframe * 60;
    const orbWindow = candles.filter(c => c.time >= target8am - useMins * 30 && c.time < windowEnd);

    // Fallback: if no candles in exact window, use the single closest to 8am
    const orbCandles = orbWindow.length > 0
      ? orbWindow
      : [candles.reduce((best, c) =>
          Math.abs(c.time - target8am) < Math.abs(best.time - target8am) ? c : best,
          candles[0]
        )];

    const orbHigh  = Math.max(...orbCandles.map(c => c.high));
    const orbLow   = Math.min(...orbCandles.map(c => c.low));
    const orbMid   = (orbHigh + orbLow) / 2;
    const orbRange = orbHigh - orbLow;

    // How far was the anchor candle from 8am?
    const anchorCandle = orbCandles[0];
    const timeDiffMinutes = Math.round(Math.abs(anchorCandle.time - target8am) / 60);

    const currentPrice = candles[candles.length - 1].close;
    const bias: 'bullish' | 'bearish' | 'neutral' =
      currentPrice > orbMid ? 'bullish' : currentPrice < orbMid ? 'bearish' : 'neutral';

    const extensions = [
      { label: 'T1 Up 0.5x',   price: round2(orbHigh + orbRange * 0.5), direction: 'up'   as const, multiplier: 0.5 },
      { label: 'T2 Up 1.0x',   price: round2(orbHigh + orbRange * 1.0), direction: 'up'   as const, multiplier: 1.0 },
      { label: 'T3 Up 1.5x',   price: round2(orbHigh + orbRange * 1.5), direction: 'up'   as const, multiplier: 1.5 },
      { label: 'T4 Up 2.0x',   price: round2(orbHigh + orbRange * 2.0), direction: 'up'   as const, multiplier: 2.0 },
      { label: 'T1 Down 0.5x', price: round2(orbLow  - orbRange * 0.5), direction: 'down' as const, multiplier: 0.5 },
      { label: 'T2 Down 1.0x', price: round2(orbLow  - orbRange * 1.0), direction: 'down' as const, multiplier: 1.0 },
      { label: 'T3 Down 1.5x', price: round2(orbLow  - orbRange * 1.5), direction: 'down' as const, multiplier: 1.5 },
      { label: 'T4 Down 2.0x', price: round2(orbLow  - orbRange * 2.0), direction: 'down' as const, multiplier: 2.0 },
    ];

    return NextResponse.json({
      success:         true,
      symbol,
      timeframe,
      orbHigh:         round2(orbHigh),
      orbLow:          round2(orbLow),
      orbMid:          round2(orbMid),
      orbRange:        round2(orbRange),
      currentPrice:    round2(currentPrice),
      bias,
      extensions,
      candleTime:      new Date(anchorCandle.time * 1000).toISOString(),
      candleTimestamp: anchorCandle.time,
      timeDiffMinutes,
      hasValidOrb:     timeDiffMinutes <= timeframe + 5,
      orbCandleCount:  orbCandles.length,
      recentCandles:   candles.slice(-12),
      dataSource,
      fetchedAt:       new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error:   err instanceof Error ? err.message : 'ORB data unavailable',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
