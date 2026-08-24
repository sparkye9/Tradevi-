/**
 * Trend Bias Stack — Weekly / Daily / 4H structure engine.
 *
 * TypeScript port of the swing_trend_bias.py structure engine (kept at
 * scripts/swing_trend_bias.py for local TradingView validation). Runs as a
 * Next.js API route instead of a separate Python service, since this repo
 * ships as a single Next.js app on Vercel — reuses the free, keyless Yahoo
 * Finance chart fetcher already in lib/yahooChart.ts instead of yfinance.
 *
 * Slice 1: structure-based bias (HH/HL vs LH/LL), not moving-average based.
 * Slice 2: dealing-range levels, premium/discount, invalidation, and a
 *          swing suggestion that is gated by the stack alignment.
 */
import { fetchYahooCandles, type YFCandle } from './yahooChart';
import {
  type IntradaySetupResult,
  type TradeSetup,
  intradaySetupFromLevels,
  swingSetupFromDaily,
} from './futuresSetups';

// Instrument -> free data symbol. MNQ reads NQ=F (same underlying index,
// 1/10 size), MES reads ES=F, MYM reads YM=F, M2K reads RTY=F.
export const INSTRUMENT_MAP: Record<string, string> = {
  MNQ: 'NQ=F',
  NQ: 'NQ=F',
  MES: 'ES=F',
  ES: 'ES=F',
  MYM: 'YM=F',
  YM: 'YM=F',
  M2K: 'RTY=F',
  RTY: 'RTY=F',
  GC: 'GC=F',
};

/** Instruments shown in the UI (aliases like NQ/ES stay in the map for the API). */
export const DISPLAY_INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'M2K', 'GC'] as const;

export type DeskInstrument = (typeof DISPLAY_INSTRUMENTS)[number];

/** Micro on the desk → delayed tape symbol + TradingView confirm symbol. */
export const DESK_FUTURES: {
  instrument: DeskInstrument;
  tape: string;
  tv: string;
  name: string;
}[] = [
  { instrument: 'MNQ', tape: 'NQ', tv: 'MNQ1!', name: 'Nasdaq' },
  { instrument: 'MES', tape: 'ES', tv: 'MES1!', name: 'S&P' },
  { instrument: 'MYM', tape: 'YM', tv: 'MYM1!', name: 'Dow' },
  { instrument: 'M2K', tape: 'RTY', tv: 'M2K1!', name: 'Russell' },
  { instrument: 'GC', tape: 'GC', tv: 'GC1!', name: 'Gold' },
];

// How many bars on each side a candle must dominate to count as a swing
// pivot. Higher = fewer, more significant swings. Tune during validation
// against your Pine/TradingView structure reads.
const SWING_STRICTNESS = 2;

export type Bias = 'up' | 'down' | 'range';
export type Timeframe = 'Weekly' | 'Daily' | '4H';
export type Zone = 'premium' | 'discount' | 'equilibrium' | 'unknown';
export type SwingAction = 'LOOK_LONG' | 'LOOK_SHORT' | 'STAND_DOWN';
export type Conviction = 'high' | 'moderate' | 'low';

export interface TrendRead {
  bias: Bias;
  reason: string;
}

export interface SwingPoint {
  index: number;
  price: number;
}

export interface StructureLevels {
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  prevSwingHigh: number | null;
  prevSwingLow: number | null;
  equilibrium: number | null;
  invalidation: number | null;
  zone: Zone;
}

export interface SwingSuggestion {
  action: SwingAction;
  conviction: Conviction;
  headline: string;
  playbook: string[];
}

export type QualityLabel = 'TRADE' | 'WAIT' | 'NO_TRADE';

export interface SetupQuality {
  score: number;
  label: QualityLabel;
  headline: string;
  reasons: string[];
  missing: string[];
}

export interface TrendBiasStackResult {
  instrument: string;
  dataSymbol: string;
  lastPrice: number | null;
  reads: Record<Timeframe, TrendRead>;
  levels: Record<Timeframe, StructureLevels>;
  alignment: string;
  suggestion: SwingSuggestion;
  quality: SetupQuality;
  swingSetup: TradeSetup;
  intraday: IntradaySetupResult | null;
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
export function classify(candles: YFCandle[], k = SWING_STRICTNESS): TrendRead {
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

function lastClose(candles: YFCandle[]): number | null {
  if (candles.length === 0) return null;
  return candles[candles.length - 1].close;
}

function zoneFor(lastPrice: number | null, equilibrium: number | null): Zone {
  if (lastPrice == null || equilibrium == null || equilibrium === 0) return 'unknown';
  const dist = (lastPrice - equilibrium) / Math.abs(equilibrium);
  if (Math.abs(dist) < 0.0015) return 'equilibrium';
  return lastPrice > equilibrium ? 'premium' : 'discount';
}

/** Dealing-range levels from confirmed swings. Invalidation follows the bias. */
export function structureLevels(
  candles: YFCandle[],
  bias: Bias,
  lastPrice: number | null,
  k = SWING_STRICTNESS
): StructureLevels {
  const { highs, lows } = swingPoints(candles, k);
  const lastSwingHigh = highs.length ? highs[highs.length - 1].price : null;
  const prevSwingHigh = highs.length >= 2 ? highs[highs.length - 2].price : null;
  const lastSwingLow = lows.length ? lows[lows.length - 1].price : null;
  const prevSwingLow = lows.length >= 2 ? lows[lows.length - 2].price : null;
  const equilibrium =
    lastSwingHigh != null && lastSwingLow != null ? (lastSwingHigh + lastSwingLow) / 2 : null;

  let invalidation: number | null = null;
  if (bias === 'up') invalidation = lastSwingLow;
  else if (bias === 'down') invalidation = lastSwingHigh;

  return {
    lastSwingHigh,
    lastSwingLow,
    prevSwingHigh,
    prevSwingLow,
    equilibrium,
    invalidation,
    zone: zoneFor(lastPrice, equilibrium),
  };
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}

/**
 * Slice 2 — gated swing suggestion.
 *
 * Daily is the dealing range (premium/discount + invalidation).
 * 4H is the entry timeframe. Weekly is the higher-timeframe vote.
 * Conflicting HTF bias = stand down. Stacked alignment = high conviction,
 * but still wait for discount (longs) or premium (shorts) instead of chasing.
 */
export function swingSuggestion(
  instrument: string,
  reads: Record<Timeframe, TrendRead>,
  daily: StructureLevels,
  fourH: StructureLevels,
  lastPrice: number | null
): SwingSuggestion {
  const w = reads.Weekly.bias;
  const d = reads.Daily.bias;
  const h = reads['4H'].bias;
  const stackedLong = w === 'up' && d === 'up' && h === 'up';
  const stackedShort = w === 'down' && d === 'down' && h === 'down';
  const conflict = (w === 'up' && (d === 'down' || h === 'down')) || (w === 'down' && (d === 'up' || h === 'up'));

  const px = fmt(lastPrice);
  const rangeLine = `Daily dealing range: ${fmt(daily.lastSwingLow)} low → ${fmt(daily.lastSwingHigh)} high. Equilibrium ${fmt(daily.equilibrium)}. Last ${px} (${daily.zone}).`;

  if (stackedLong) {
    const inDiscount = daily.zone === 'discount' || fourH.zone === 'discount';
    return {
      action: 'LOOK_LONG',
      conviction: 'high',
      headline: inDiscount
        ? `STACKED LONG · ${instrument} is in discount. Look for longs.`
        : `STACKED LONG · wait for a 4H discount before longing ${instrument}.`,
      playbook: [
        `${instrument} is stacked long on Weekly / Daily / 4H. Swings favor longs only.`,
        rangeLine,
        inDiscount
          ? 'Price is in discount relative to the dealing range — this is where you look for a long, not chase premium.'
          : 'Price is in premium or at equilibrium. Do not chase. Wait for a 4H pullback into discount (below daily EQ) before looking long.',
        `Invalidation: a Daily close below ${fmt(daily.invalidation)} (last confirmed swing low) kills the long bias. Flatten.`,
        'If 4H prints a lower low against Weekly/Daily up, stand down until 4H structure repairs.',
      ],
    };
  }

  if (stackedShort) {
    const inPremium = daily.zone === 'premium' || fourH.zone === 'premium';
    return {
      action: 'LOOK_SHORT',
      conviction: 'high',
      headline: inPremium
        ? `STACKED SHORT · ${instrument} is in premium. Look for shorts.`
        : `STACKED SHORT · wait for a 4H premium before shorting ${instrument}.`,
      playbook: [
        `${instrument} is stacked short on Weekly / Daily / 4H. Swings favor shorts only.`,
        rangeLine,
        inPremium
          ? 'Price is in premium relative to the dealing range — this is where you look for a short, not chase discount breakdowns.'
          : 'Price is in discount or at equilibrium. Do not chase. Wait for a 4H bounce into premium (above daily EQ) before looking short.',
        `Invalidation: a Daily close above ${fmt(daily.invalidation)} (last confirmed swing high) kills the short bias. Flatten.`,
        'If 4H prints a higher high against Weekly/Daily down, stand down until 4H structure repairs.',
      ],
    };
  }

  if (conflict) {
    return {
      action: 'STAND_DOWN',
      conviction: 'low',
      headline: `CONFLICTING · stand down on ${instrument} swings.`,
      playbook: [
        `Weekly ${w} / Daily ${d} / 4H ${h} — mixed structure. No swing until the stack agrees.`,
        rangeLine,
        'Do not average into a conflicting stack. Intraday scalps only, or pass.',
        'Re-check after the next Daily close. A fresh swing pivot is what flips this, not a moving average.',
      ],
    };
  }

  // Partial alignment: some timeframes range, the rest agree.
  const directional = [w, d, h].filter((b) => b !== 'range');
  const longs = directional.filter((b) => b === 'up').length;
  const shorts = directional.filter((b) => b === 'down').length;
  const dominant: Bias = longs > shorts ? 'up' : shorts > longs ? 'down' : 'range';

  if (dominant === 'up') {
    return {
      action: 'LOOK_LONG',
      conviction: 'moderate',
      headline: `PARTIAL LONG · ${instrument} leans long. Trade the discount only, smaller size.`,
      playbook: [
        `Weekly ${w} / Daily ${d} / 4H ${h} — not fully stacked. Longs are the dominant side, not a high-conviction swing.`,
        rangeLine,
        'Wait for discount (below daily EQ). Skip premium longs.',
        `Soft invalidation: Daily close below ${fmt(daily.lastSwingLow)}. Cut size vs a stacked long.`,
      ],
    };
  }

  if (dominant === 'down') {
    return {
      action: 'LOOK_SHORT',
      conviction: 'moderate',
      headline: `PARTIAL SHORT · ${instrument} leans short. Trade the premium only, smaller size.`,
      playbook: [
        `Weekly ${w} / Daily ${d} / 4H ${h} — not fully stacked. Shorts are the dominant side, not a high-conviction swing.`,
        rangeLine,
        'Wait for premium (above daily EQ). Skip discount chases.',
        `Soft invalidation: Daily close above ${fmt(daily.lastSwingHigh)}. Cut size vs a stacked short.`,
      ],
    };
  }

  return {
    action: 'STAND_DOWN',
    conviction: 'low',
    headline: `NO EDGE · ${instrument} is range across the stack.`,
    playbook: [
      'Weekly / Daily / 4H are all range or mixed without a dominant side.',
      rangeLine,
      'No swing. Wait for a confirmed HH/HL or LH/LL on Daily before looking.',
    ],
  };
}

const HONEST_GAPS = [
  'FVG, BOS, and CHOCH are not computed here — confirm those on TradingView.',
  'Entry / stop / TP1 / TP2 are swing high, equilibrium, and swing low — not VWAP or a percent guess.',
  'No historical analog matching. This is not a backtested twin of prior sessions.',
  'Yahoo data is delayed. Last price is not a live feed. Intraday map uses 15-minute bars and refreshes every 10 minutes.',
];

/**
 * Workstation quality: stacked + correct dealing-range zone can be a trade.
 * Anything weaker is WAIT or NO TRADE. Chasing premium longs / discount shorts
 * is not a trade even when the stack agrees.
 */
export function setupQuality(
  suggestion: SwingSuggestion,
  reads: Record<Timeframe, TrendRead>,
  daily: StructureLevels
): SetupQuality {
  const missing = [...HONEST_GAPS];

  if (suggestion.action === 'STAND_DOWN') {
    return {
      score: 12,
      label: 'NO_TRADE',
      headline: suggestion.headline,
      reasons: ['Weekly / Daily / 4H do not agree. No swing until the stack is clean.'],
      missing,
    };
  }

  const reasons: string[] = [];
  let score = 0;
  if (suggestion.conviction === 'high') {
    score += 50;
    reasons.push('Weekly / Daily / 4H stacked');
  } else {
    score += 28;
    reasons.push('Partial stack — not high conviction');
  }

  const lookingLong = suggestion.action === 'LOOK_LONG';
  const zoneOk = lookingLong ? daily.zone === 'discount' : daily.zone === 'premium';

  if (!zoneOk) {
    return {
      score: Math.min(score, 35),
      label: 'WAIT',
      headline: lookingLong
        ? 'NO TRADE yet — wait for discount. Do not chase premium.'
        : 'NO TRADE yet — wait for premium. Do not chase discount.',
      reasons: [...reasons, `Daily zone is ${daily.zone}`],
      missing,
    };
  }

  score += 30;
  reasons.push(lookingLong ? 'Daily is in discount' : 'Daily is in premium');

  if (daily.invalidation != null) {
    score += 15;
    reasons.push('Invalidation level is defined');
  }

  const thin = Object.values(reads).some((r) => r.reason === 'not enough confirmed swings');
  if (thin) {
    score -= 10;
    reasons.push('Thin swing history on at least one timeframe');
  } else {
    score += 5;
  }

  if (suggestion.conviction !== 'high') {
    return {
      score: Math.min(70, Math.max(0, score)),
      label: 'WAIT',
      headline: 'NO TRADE unless you cut size — stack is only partial.',
      reasons,
      missing,
    };
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    label: 'TRADE',
    headline: suggestion.headline,
    reasons,
    missing,
  };
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

  const [weekly, daily, hourly, fifteen] = await Promise.all([
    fetchYahooCandles(symbol, '2y', '1wk'),
    fetchYahooCandles(symbol, '1y', '1d'),
    fetchYahooCandles(symbol, '3mo', '1h'),
    fetchYahooCandles(symbol, '10d', '15m').catch(() => null),
  ]);

  const fourH = resample4h(hourly.candles);
  const lastPrice =
    (fifteen ? lastClose(fifteen.candles) : null) ??
    lastClose(daily.candles) ??
    lastClose(fourH) ??
    lastClose(hourly.candles);

  const reads: Record<Timeframe, TrendRead> = {
    Weekly: classify(weekly.candles),
    Daily: classify(daily.candles),
    '4H': classify(fourH),
  };

  const levels: Record<Timeframe, StructureLevels> = {
    Weekly: structureLevels(weekly.candles, reads.Weekly.bias, lastPrice),
    Daily: structureLevels(daily.candles, reads.Daily.bias, lastPrice),
    '4H': structureLevels(fourH, reads['4H'].bias, lastPrice),
  };

  const suggestion = swingSuggestion(instrument.toUpperCase(), reads, levels.Daily, levels['4H'], lastPrice);
  const swingSetup = swingSetupFromDaily(suggestion.action, levels.Daily, lastPrice);

  let intraday: IntradaySetupResult | null = null;
  if (fifteen && fifteen.candles.length > 0) {
    const intraLast = lastClose(fifteen.candles);
    const read = classify(fifteen.candles);
    const intraLevels = structureLevels(fifteen.candles, read.bias, intraLast);
    intraday = {
      timeframe: '15m',
      lastPrice: intraLast,
      read,
      levels: intraLevels,
      setup: intradaySetupFromLevels(read, intraLevels, intraLast),
      asOf: new Date().toISOString(),
      refreshMinutes: 10,
    };
  }

  return {
    instrument: instrument.toUpperCase(),
    dataSymbol: symbol,
    lastPrice,
    reads,
    levels,
    alignment: alignment(reads),
    suggestion,
    quality: setupQuality(suggestion, reads, levels.Daily),
    swingSetup,
    intraday,
    asOf: new Date().toISOString(),
  };
}
