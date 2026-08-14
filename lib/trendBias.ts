/**
 * Trend Bias Stack — Weekly / Daily / 4H structure engine.
 *
 * TypeScript port of the swing_trend_bias.py structure engine (kept at
 * scripts/swing_trend_bias.py for local TradingView validation). Runs as a
 * Next.js API route instead of a separate Python service, since this repo
 * ships as a single Next.js app on Vercel — reuses the free, keyless Yahoo
 * Finance chart fetcher already in lib/yahooChart.ts instead of yfinance.
 *
 * Structure-based, not moving-average based: trend = higher highs and higher
 * lows (up), lower highs and lower lows (down), anything else is range.
 */
import { fetchYahooCandles, type YFCandle } from './yahooChart';

// Instrument -> free data symbol. MNQ reads NQ=F (same underlying index,
// 1/10 size), MES reads ES=F, MYM reads YM=F.
export const INSTRUMENT_MAP: Record<string, string> = {
  MNQ: 'NQ=F',
  NQ: 'NQ=F',
  MES: 'ES=F',
  ES: 'ES=F',
  MYM: 'YM=F',
  YM: 'YM=F',
  GC: 'GC=F',
};

// How many bars on each side a candle must dominate to count as a swing
// pivot. Higher = fewer, more significant swings. Tune during validation
// against your Pine/TradingView structure reads.
const SWING_STRICTNESS = 2;

export type Bias = 'up' | 'down' | 'range';
export type Timeframe = 'Weekly' | 'Daily' | '4H';

export interface TrendRead {
  bias: Bias;
  reason: string;
}

export interface SwingPoint {
  index: number;
  price: number;
}

export interface TrendBiasStackResult {
  instrument: string;
  dataSymbol: string;
  reads: Record<Timeframe, TrendRead>;
  alignment: string;
  asOf: string;
}

/** Yahoo has no native 4H interval, so 4H bars are built from 1H bars. */
function resample4h(hourly: YFCandle[]): YFCandle[] {
  const bucketSeconds = 4 * 3600;
  const buckets = new Map<number, YFCandle[]>();
  for (const c of hourly) {
    const bucketStart = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    const group = buckets.get(bucketStart);
    if (group) group.push(c);
    else buckets.set(bucketStart, [c]);
  }
  return Array.from(buckets.keys())
    .sort((a, b) => a - b)
    .map((key) => {
      const group = buckets.get(key)!;
      return {
        time: key,
        open: group[0].open,
        high: Math.max(...group.map((g) => g.high)),
        low: Math.min(...group.map((g) => g.low)),
        close: group[group.length - 1].close,
        volume: group.reduce((s, g) => s + g.volume, 0),
      };
    });
}

/**
 * Confirmed swing highs/lows: a bar whose High/Low is the strict
 * max/min of the k bars on each side. Only pivots with k confirming bars
 * after them are returned, so there is no lookahead.
 */
function swingPoints(candles: YFCandle[], k: number): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  const n = candles.length;
  for (let i = k; i < n - k; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let leftMaxH = -Infinity;
    let rightMaxH = -Infinity;
    let leftMinL = Infinity;
    let rightMinL = Infinity;
    for (let j = i - k; j < i; j++) {
      leftMaxH = Math.max(leftMaxH, candles[j].high);
      leftMinL = Math.min(leftMinL, candles[j].low);
    }
    for (let j = i + 1; j <= i + k; j++) {
      rightMaxH = Math.max(rightMaxH, candles[j].high);
      rightMinL = Math.min(rightMinL, candles[j].low);
    }
    if (h > leftMaxH && h > rightMaxH) highs.push({ index: i, price: h });
    if (l < leftMinL && l < rightMinL) lows.push({ index: i, price: l });
  }
  return { highs, lows };
}

/** Classify the last confirmed structure as up, down, or range. */
function classify(candles: YFCandle[], k = SWING_STRICTNESS): TrendRead {
  const { highs, lows } = swingPoints(candles, k);
  if (highs.length < 2 || lows.length < 2) {
    return { bias: 'range', reason: 'not enough confirmed swings' };
  }

  const lastH = highs[highs.length - 1].price;
  const prevH = highs[highs.length - 2].price;
  const lastL = lows[lows.length - 1].price;
  const prevL = lows[lows.length - 2].price;

  const higherHigh = lastH > prevH;
  const higherLow = lastL > prevL;
  const lowerHigh = lastH < prevH;
  const lowerLow = lastL < prevL;

  if (higherHigh && higherLow) return { bias: 'up', reason: 'higher high and higher low' };
  if (lowerHigh && lowerLow) return { bias: 'down', reason: 'lower high and lower low' };
  return { bias: 'range', reason: 'mixed structure (no clean HH/HL or LH/LL)' };
}

/** Turn the three timeframe biases into a single conviction read. */
function alignment(reads: Record<Timeframe, TrendRead>): string {
  const biases = Object.values(reads).map((r) => r.bias);
  if (biases.every((b) => b === 'up')) return 'STACKED LONG. High conviction. Swings favor longs.';
  if (biases.every((b) => b === 'down')) return 'STACKED SHORT. High conviction. Swings favor shorts.';
  if (biases.includes('up') && biases.includes('down')) {
    return 'CONFLICTING. Lower conviction. Stand down for swings.';
  }
  return 'PARTIAL ALIGNMENT. Moderate conviction. Trade the dominant side only.';
}

/** Compute the Weekly / Daily / 4H trend bias stack for one instrument. */
export async function trendBiasStack(instrument: string): Promise<TrendBiasStackResult> {
  const symbol = INSTRUMENT_MAP[instrument.toUpperCase()];
  if (!symbol) {
    throw new Error(
      `Unknown instrument "${instrument}". Supported: ${Object.keys(INSTRUMENT_MAP).join(', ')}`
    );
  }

  const [weekly, daily, hourly] = await Promise.all([
    fetchYahooCandles(symbol, '2y', '1wk'),
    fetchYahooCandles(symbol, '1y', '1d'),
    fetchYahooCandles(symbol, '3mo', '1h'),
  ]);

  const fourH = resample4h(hourly.candles);

  const reads: Record<Timeframe, TrendRead> = {
    Weekly: classify(weekly.candles),
    Daily: classify(daily.candles),
    '4H': classify(fourH),
  };

  return {
    instrument: instrument.toUpperCase(),
    dataSymbol: symbol,
    reads,
    alignment: alignment(reads),
    asOf: new Date().toISOString(),
  };
}
