import { NextRequest, NextResponse } from 'next/server';

// ─── Timezone helpers ─────────────────────────────────────────────────────────

function getETOffsetHours(): number {
  const now = new Date();
  const year = now.getFullYear();
  // 2nd Sunday of March (EDT starts)
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, (mar1Day === 0 ? 8 : 15 - mar1Day));
  // 1st Sunday of November (EST starts)
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
  // If 8am ET hasn't happened yet today, step back one day
  return target > now.getTime()
    ? Math.floor((target - 86400 * 1000) / 1000)
    : Math.floor(target / 1000);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Candle type ──────────────────────────────────────────────────────────────

interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── TwelveData fetch — real-time, includes extended hours ───────────────────

async function fetchTwelveCandles(symbol: string, fromSec: number): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not set');

  // start_date in ET local time (TwelveData uses exchange timezone)
  const etOffset = getETOffsetHours();
  const startDate = new Date((fromSec + etOffset * 3600) * 1000);
  const startStr = startDate.toISOString().slice(0, 16).replace('T', ' '); // "YYYY-MM-DD HH:MM"

  const url = `https://api.twelvedata.com/time_series`
    + `?symbol=${encodeURIComponent(symbol)}`
    + `&interval=5min`
    + `&outputsize=40`
    + `&prepost=1`
    + `&start_date=${encodeURIComponent(startStr)}`
    + `&order=ASC`
    + `&apikey=${apiKey}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);

  const json = await res.json();
  if (json.status === 'error') throw new Error(`TwelveData: ${json.message}`);

  const values: { datetime: string; open: string; high: string; low: string; close: string; volume: string }[] =
    json.values ?? [];

  if (!values.length) throw new Error('TwelveData returned no candles');

  // TwelveData datetime strings are in exchange local time (ET for US equities)
  // Convert back to UTC unix by reversing the ET offset
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

// ─── Yahoo Finance fallback — ~15-20 min delayed ──────────────────────────────

async function fetchYahooCandles(symbol: string, fromSec: number): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${fromSec}&period2=${nowSec}&interval=5m&includePrePost=true`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingApp/1.0)', Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo Finance returned HTML — possibly rate-limited');

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

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = sp.get('symbol')?.toUpperCase()?.trim() ?? 'QQQ';

  try {
    const target8am = get8amETTimestampForToday();
    const fromSec   = target8am - 2 * 3600; // 2h before 8am ET

    // Try TwelveData (real-time + extended hours) first, fall back to Yahoo
    let candles: Candle[];
    let dataSource: string;

    try {
      candles    = await fetchTwelveCandles(symbol, fromSec);
      dataSource = 'twelve_data';
    } catch {
      candles    = await fetchYahooCandles(symbol, fromSec);
      dataSource = 'yahoo_delayed';
    }

    if (candles.length === 0) {
      throw new Error('No valid candles returned — market may be closed or symbol invalid');
    }

    // Find the candle closest to 8am ET
    const orbCandle = candles.reduce((best, c) =>
      Math.abs(c.time - target8am) < Math.abs(best.time - target8am) ? c : best,
      candles[0]
    );

    const timeDiffMinutes = Math.round(Math.abs(orbCandle.time - target8am) / 60);

    const orbHigh  = orbCandle.high;
    const orbLow   = orbCandle.low;
    const orbMid   = (orbHigh + orbLow) / 2;
    const orbRange = orbHigh - orbLow;

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
      success:          true,
      symbol,
      orbHigh:          round2(orbHigh),
      orbLow:           round2(orbLow),
      orbMid:           round2(orbMid),
      orbRange:         round2(orbRange),
      currentPrice:     round2(currentPrice),
      bias,
      extensions,
      candleTime:       new Date(orbCandle.time * 1000).toISOString(),
      candleTimestamp:  orbCandle.time,
      timeDiffMinutes,
      hasValidOrb:      timeDiffMinutes <= 15,
      recentCandles:    candles.slice(-12),
      dataSource,
      fetchedAt:        new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error:   err instanceof Error ? err.message : 'ORB data unavailable',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
