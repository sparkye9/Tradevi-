/**
 * Liquidity & Emotional Exit Engine API
 * Liquidity mapping, emotional exit detection, continuation probability,
 * power hour forecast, scalp strike selector, entry confirmation,
 * order builder, profit protection, and final decision box.
 * Supports SPY, QQQ via ?symbol=
 */

import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';
import { calcEMA, calcRSI, calcATR, calcVWAP } from '@/lib/indicators';
import type { CandleData } from '@/lib/types';

// ─── Yahoo Finance headers ────────────────────────────────────────────────────

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

function lastValid(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i]) && !Number.isNaN(arr[i])) return arr[i];
  }
  return null;
}

function etOffsetHours(): number {
  const now = new Date();
  const y = now.getFullYear();
  const mar1 = new Date(y, 2, 1).getDay();
  const nov1 = new Date(y, 10, 1).getDay();
  const dstStart = new Date(y, 2, mar1 === 0 ? 8 : 15 - mar1);
  const dstEnd   = new Date(y, 10, nov1 === 0 ? 1 : 8 - nov1);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchYFCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=true`;
    const res = await yfFetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return [];
    const json = JSON.parse(text);
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    return timestamps.map((ts, i) => ({
      time: ts, open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0,
    })).filter(c => c.close > 0 && c.high > 0);
  } catch { return []; }
}

async function fetchYFQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await yfFetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return null;
    const json = JSON.parse(text);
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice ?? 0);
    const prev  = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    return { price: r2(price), prevClose: r2(prev), change: r2(price - prev), changePct: r2(prev > 0 ? ((price - prev) / prev) * 100 : 0) };
  } catch { return null; }
}

// ─── RTH open timestamp ───────────────────────────────────────────────────────

function rthOpenTsToday(): number {
  const off = etOffsetHours();
  const now = new Date();
  const utcH = 9 - off;
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((base + (utcH * 60 + 30) * 60_000) / 1000);
}

// ─── Timeframe analysis ───────────────────────────────────────────────────────

interface TFResult {
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
}

function analyzeTF(label: string, candles: CandleData[]): TFResult {
  if (candles.length < 10) {
    return { label, bias: 'neutral', score: 50, ema9: null, ema21: null, rsi: null };
  }
  const closes = candles.map(c => c.close);
  const price  = closes[closes.length - 1];
  const ema9   = lastValid(calcEMA(closes, 9));
  const ema21  = lastValid(calcEMA(closes, Math.min(21, closes.length)));
  const rsi    = lastValid(calcRSI(closes, 14));
  let score = 50;
  if (ema9  != null) { score += price > ema9  ? 15 : -15; }
  if (ema21 != null) { score += price > ema21 ? 15 : -15; }
  if (ema9  != null && ema21 != null) { score += ema9 > ema21 ? 10 : -10; }
  if (rsi   != null) { score += rsi > 55 ? 10 : rsi < 45 ? -10 : 0; }
  score = Math.max(0, Math.min(100, score));
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (ema9 != null && ema21 != null) {
    if (price > ema9 && price > ema21) bias = 'bullish';
    else if (price < ema9 && price < ema21) bias = 'bearish';
  }
  return {
    label, bias, score,
    ema9:  ema9  != null ? r2(ema9)  : null,
    ema21: ema21 != null ? r2(ema21) : null,
    rsi:   rsi   != null ? r2(rsi)   : null,
  };
}

// ─── Section 1: Liquidity Mapping Engine ─────────────────────────────────────

interface LiquidityLevel {
  price: number;
  type: 'weak_high' | 'weak_low' | 'equal_highs' | 'equal_lows' | 'stop_hunt_zone' | 'prior_day_high' | 'prior_day_low' | 'premarket_high' | 'premarket_low' | 'vwap_deviation' | 'liquidity_pool';
  color: 'red' | 'green' | 'yellow' | 'purple';
  label: string;
  description: string;
  distanceFromPrice: number;
  distancePct: number;
  isAbove: boolean;
}

function computeLiquidityLevels(
  currentPrice: number,
  dailyCandles: CandleData[],
  candles5m: CandleData[],
  rthTs: number,
  vwap: number,
  atr: number,
): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];

  const addLevel = (price: number, type: LiquidityLevel['type'], color: LiquidityLevel['color'], label: string, description: string) => {
    const dist = r2(Math.abs(price - currentPrice));
    const distPct = r2((dist / currentPrice) * 100);
    levels.push({ price: r2(price), type, color, label, description, distanceFromPrice: dist, distancePct: distPct, isAbove: price > currentPrice });
  };

  // Prior day H/L
  if (dailyCandles.length >= 2) {
    const priorDay = dailyCandles[dailyCandles.length - 2];
    addLevel(priorDay.high, 'prior_day_high', 'purple', 'Prior Day High', 'Key institutional reference — prior session high');
    addLevel(priorDay.low, 'prior_day_low', 'purple', 'Prior Day Low', 'Key institutional reference — prior session low');
  }

  // Premarket H/L
  const premarketCandles = candles5m.filter(c => c.time < rthTs);
  if (premarketCandles.length > 0) {
    const pmHigh = Math.max(...premarketCandles.map(c => c.high));
    const pmLow  = Math.min(...premarketCandles.map(c => c.low));
    addLevel(pmHigh, 'premarket_high', 'yellow', 'Premarket High', 'Premarket liquidity level — often tested at open');
    addLevel(pmLow,  'premarket_low',  'yellow', 'Premarket Low',  'Premarket support — potential sweep target');
  }

  // RTH 5m candles
  const rthCandles = candles5m.filter(c => c.time >= rthTs);
  const n = rthCandles.length;

  // Swing highs / lows
  const swingHighs: number[] = [];
  const swingLows:  number[] = [];
  if (n >= 7) {
    for (let i = 3; i < n - 3; i++) {
      const c = rthCandles[i];
      const leftHighs  = [rthCandles[i-1].high, rthCandles[i-2].high, rthCandles[i-3].high];
      const rightHighs = [rthCandles[i+1].high, rthCandles[i+2].high, rthCandles[i+3].high];
      const leftLows   = [rthCandles[i-1].low,  rthCandles[i-2].low,  rthCandles[i-3].low];
      const rightLows  = [rthCandles[i+1].low,  rthCandles[i+2].low,  rthCandles[i+3].low];
      const isSwingHigh = leftHighs.every(h => h < c.high) && rightHighs.every(h => h < c.high);
      const isSwingLow  = leftLows.every(l => l > c.low)   && rightLows.every(l => l > c.low);
      if (isSwingHigh) {
        const pullbackPct = (c.high - currentPrice) / c.high * 100;
        if (pullbackPct > 0.15) {
          swingHighs.push(c.high);
          addLevel(c.high, 'weak_high', 'red', 'Weak High', 'Retail stop cluster detected');
        }
      }
      if (isSwingLow) {
        const pullbackPct = (currentPrice - c.low) / currentPrice * 100;
        if (pullbackPct > 0.15) {
          swingLows.push(c.low);
          addLevel(c.low, 'weak_low', 'green', 'Weak Low', 'Liquidity likely resting here');
        }
      }
    }
  }

  // Equal highs / equal lows
  const eqHighCandidates = swingHighs.slice();
  const usedEqHighs = new Set<number>();
  for (let i = 0; i < eqHighCandidates.length; i++) {
    if (usedEqHighs.has(i)) continue;
    const group = [eqHighCandidates[i]];
    for (let j = i + 1; j < eqHighCandidates.length; j++) {
      if (usedEqHighs.has(j)) continue;
      const ratio = eqHighCandidates[j] / eqHighCandidates[i];
      if (ratio >= 0.999 && ratio <= 1.001) { group.push(eqHighCandidates[j]); usedEqHighs.add(j); }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((a, b) => a + b, 0) / group.length;
      addLevel(avgPrice, 'equal_highs', 'red', 'Equal Highs', 'Potential sweep zone — stops clustered above');
      addLevel(avgPrice * 1.001, 'stop_hunt_zone', 'yellow', 'Stop Hunt Zone', 'Potential sweep zone');
      usedEqHighs.add(i);
    }
  }

  const eqLowCandidates = swingLows.slice();
  const usedEqLows = new Set<number>();
  for (let i = 0; i < eqLowCandidates.length; i++) {
    if (usedEqLows.has(i)) continue;
    const group = [eqLowCandidates[i]];
    for (let j = i + 1; j < eqLowCandidates.length; j++) {
      if (usedEqLows.has(j)) continue;
      const ratio = eqLowCandidates[j] / eqLowCandidates[i];
      if (ratio >= 0.999 && ratio <= 1.001) { group.push(eqLowCandidates[j]); usedEqLows.add(j); }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((a, b) => a + b, 0) / group.length;
      addLevel(avgPrice, 'equal_lows', 'green', 'Equal Lows', 'Potential sweep zone — stops clustered below');
      addLevel(avgPrice * 0.999, 'stop_hunt_zone', 'yellow', 'Stop Hunt Zone', 'Potential sweep zone');
      usedEqLows.add(i);
    }
  }

  // VWAP deviation bands
  if (atr > 0) {
    addLevel(vwap + atr,     'vwap_deviation', 'purple', 'VWAP +1 ATR', 'Institutional reaction zone');
    addLevel(vwap - atr,     'vwap_deviation', 'purple', 'VWAP -1 ATR', 'Institutional reaction zone');
    addLevel(vwap + 2 * atr, 'vwap_deviation', 'purple', 'VWAP +2 ATR', 'Institutional reaction zone');
    addLevel(vwap - 2 * atr, 'vwap_deviation', 'purple', 'VWAP -2 ATR', 'Institutional reaction zone');
  }

  // Sort by distance, return max 12
  return levels
    .sort((a, b) => a.distanceFromPrice - b.distanceFromPrice)
    .slice(0, 12);
}

// ─── Section 2: Emotional Exit Detector ──────────────────────────────────────

interface EmotionalSignal {
  type: 'panic_selling' | 'fomo_buying' | 'exhaustion_buying' | 'weak_hands_exit' | 'late_breakout_trap' | 'long_wick_rejection' | 'compression_expansion' | 'momentum_exhaustion' | 'trapped_long' | 'trapped_short';
  detected: boolean;
  severity: 'low' | 'medium' | 'high';
  label: string;
  description: string;
  confirmation: string;
}

function detectEmotionalExits(candles: CandleData[], rsi: number | null, vwap: number, atr: number): EmotionalSignal[] {
  const n = candles.length;
  const signals: EmotionalSignal[] = [];
  if (n < 5) return signals;

  const last = candles[n - 1];
  const recent15 = candles.slice(Math.max(0, n - 15));
  const recent10 = candles.slice(Math.max(0, n - 10));
  const recent8  = candles.slice(Math.max(0, n - 8));
  const recent5  = candles.slice(Math.max(0, n - 5));

  const avgVol = recent15.reduce((s, c) => s + c.volume, 0) / recent15.length;

  // Panic selling
  const panicDetected = (() => {
    if (recent10.length < 3) return false;
    let streak = 0;
    let prevVol = 0;
    for (let i = recent10.length - 1; i >= 0; i--) {
      const c = recent10[i];
      if (c.close < c.open && (streak === 0 || c.volume > prevVol)) {
        streak++;
        prevVol = c.volume;
      } else break;
    }
    return streak >= 3 && rsi != null && rsi < 40;
  })();
  signals.push({
    type: 'panic_selling', detected: panicDetected, severity: 'high',
    label: 'Panic Selling Detected',
    description: '3+ consecutive red candles with escalating volume — retail fear at peak',
    confirmation: 'RSI < 40 with volume expansion on each successive candle',
  });

  // FOMO buying
  const fomoDetected = (() => {
    if (recent10.length < 3) return false;
    let streak = 0;
    for (let i = recent10.length - 1; i >= 0; i--) {
      if (recent10[i].close > recent10[i].open) streak++;
      else break;
    }
    const lastVolSpike = last.volume > avgVol * 2;
    const aboveVwap = last.close > vwap + 1.5 * atr;
    return streak >= 3 && lastVolSpike && aboveVwap && rsi != null && rsi > 65;
  })();
  signals.push({
    type: 'fomo_buying', detected: fomoDetected, severity: 'medium',
    label: 'FOMO Buying — Exhaustion Risk',
    description: '3+ green candles + volume spike + extended above VWAP — late buyers entering',
    confirmation: 'RSI > 65, price > VWAP + 1.5 ATR, last candle volume > 2x average',
  });

  // Exhaustion buying / momentum exhaustion
  const exhaustionDetected = (() => {
    if (recent10.length < 6) return false;
    const mid = Math.floor(recent10.length / 2);
    const firstHalf = recent10.slice(0, mid);
    const secondHalf = recent10.slice(mid);
    const firstHighPrice = Math.max(...firstHalf.map(c => c.high));
    const secondHighPrice = Math.max(...secondHalf.map(c => c.high));
    if (secondHighPrice <= firstHighPrice) return false;
    const firstRsiAtHigh = rsi != null ? rsi + 5 : null;
    const currentRsi = rsi;
    return firstRsiAtHigh != null && currentRsi != null && currentRsi < firstRsiAtHigh - 3;
  })();
  signals.push({
    type: 'exhaustion_buying', detected: exhaustionDetected, severity: 'medium',
    label: 'Momentum Likely Exhausting',
    description: 'Price making higher high but RSI diverging lower — bearish momentum divergence',
    confirmation: 'Price at session high with RSI lower than prior push to highs',
  });

  // Weak hands exit
  const weakHandsDetected = (() => {
    if (recent8.length < 4) return false;
    const sessionLow = Math.min(...candles.slice(0, Math.max(1, n - 8)).map(c => c.low));
    let failedReclaims = 0;
    for (const c of recent8) {
      if (c.high > sessionLow && c.close < sessionLow) failedReclaims++;
    }
    return failedReclaims >= 2;
  })();
  signals.push({
    type: 'weak_hands_exit', detected: weakHandsDetected, severity: 'medium',
    label: 'Potential Emotional Unwind',
    description: '2+ failed reclaim attempts — retail repeatedly trying and failing to reclaim support',
    confirmation: 'High > support level but closes below on 2+ candles in last 8',
  });

  // Late breakout trap
  const lateBreakoutDetected = (() => {
    if (n < 5) return false;
    const lookback = candles.slice(0, n - 4);
    if (lookback.length < 2) return false;
    const sessionHigh = Math.max(...lookback.map(c => c.high));
    const last4 = candles.slice(n - 4);
    let brokeHigh = false;
    let brokeHighIdx = -1;
    for (let i = 0; i < last4.length; i++) {
      if (last4[i].high > sessionHigh && last4[i].volume > avgVol) {
        brokeHigh = true;
        brokeHighIdx = i;
        break;
      }
    }
    if (!brokeHigh || brokeHighIdx < 0) return false;
    for (let i = brokeHighIdx + 1; i < last4.length; i++) {
      if (last4[i].close < sessionHigh) return true;
    }
    return false;
  })();
  signals.push({
    type: 'late_breakout_trap', detected: lateBreakoutDetected, severity: 'high',
    label: 'Late Breakout Trap — Retail Trapped Long',
    description: 'Price broke session high with volume but closed back below — classic bull trap',
    confirmation: 'Volume spike on breakout candle, subsequent close back below session high',
  });

  // Long wick rejection
  const longWickDetected = (() => {
    if (n < 2) return false;
    const checkWick = (c: CandleData) => {
      const body = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.close, c.open);
      const lowerWick = Math.min(c.close, c.open) - c.low;
      return (upperWick > body * 2) || (lowerWick > body * 2);
    };
    return checkWick(candles[n - 1]) || checkWick(candles[n - 2]);
  })();
  signals.push({
    type: 'long_wick_rejection', detected: longWickDetected, severity: 'medium',
    label: 'Long Wick Rejection',
    description: 'Last 1-2 candles show long wicks — price rejected hard at extremes',
    confirmation: 'Wick > 2x body size on last 2 candles',
  });

  // Trapped long
  const trappedLongDetected = (() => {
    if (n < 12) return false;
    const prior10 = candles.slice(n - 12, n - 2);
    const aboveVwapCount = prior10.filter(c => c.close > vwap).length;
    return aboveVwapCount >= 10 && last.close < vwap;
  })();
  signals.push({
    type: 'trapped_long', detected: trappedLongDetected, severity: 'high',
    label: 'Retail Trapped Long',
    description: 'Price held above VWAP for 10+ candles then dropped below — longs now underwater',
    confirmation: 'Price sustained above VWAP then current close < VWAP',
  });

  // Trapped short
  const trappedShortDetected = (() => {
    if (n < 5) return false;
    let rejections = 0;
    for (const c of recent10) {
      if (c.high > vwap && c.close < vwap) rejections++;
    }
    return rejections >= 2 && last.close > vwap;
  })();
  signals.push({
    type: 'trapped_short', detected: trappedShortDetected, severity: 'high',
    label: 'Retail Trapped Short',
    description: 'Multiple VWAP rejections followed by reclaim — shorts now squeezed',
    confirmation: '2+ candles rejected at VWAP then current close > VWAP',
  });

  // Compression expansion
  const compressionDetected = (() => {
    if (recent5.length < 5 || n < 6) return false;
    const priorCandle = candles[n - 6];
    const compressionOk = recent5.slice(0, 4).every(c => {
      const rangePct = (c.high - c.low) / c.close * 100;
      return rangePct < 0.15;
    });
    const expansionPct = (priorCandle.high - priorCandle.low) / priorCandle.close * 100;
    return compressionOk && expansionPct > 0.4;
  })();
  signals.push({
    type: 'compression_expansion', detected: compressionDetected, severity: 'medium',
    label: 'Compression Breakout — Direction TBD',
    description: '5 tight candles followed by expansion — coiled spring releasing energy',
    confirmation: '4 candles with range < 0.15% then candle with range > 0.4%',
  });

  return signals;
}

// ─── Section 3: Trend Continuation Probability ───────────────────────────────

interface ContinuationResult {
  alignmentScore: number;
  continuationPct: number;
  reversalPct: number;
  squeezePct: number;
  chopPct: number;
  lowerVsHigherConflict: boolean;
  conflictWarning: string | null;
}

function computeContinuationProb(
  tfScores: number[],
  overallBias: 'bullish' | 'bearish' | 'neutral',
  isChop: boolean,
  emotionalSignals: EmotionalSignal[],
  shortBias: 'bullish' | 'bearish' | 'neutral',
  longBias: 'bullish' | 'bearish' | 'neutral',
): ContinuationResult {
  const avg = tfScores.reduce((s, v) => s + v, 0) / (tfScores.length || 1);
  const variance = tfScores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (tfScores.length || 1);
  const stdDev = Math.sqrt(variance);
  const alignmentScore = Math.max(0, Math.min(100, Math.round(100 - stdDev * 2)));

  const compressionSig = emotionalSignals.find(s => s.type === 'compression_expansion' && s.detected);
  const exhaustionSig  = emotionalSignals.find(s => s.type === 'exhaustion_buying' && s.detected);
  const trappedLong    = emotionalSignals.find(s => s.type === 'trapped_long' && s.detected);
  const trappedShort   = emotionalSignals.find(s => s.type === 'trapped_short' && s.detected);
  const lateBreakout   = emotionalSignals.find(s => s.type === 'late_breakout_trap' && s.detected);

  let rawContinuation = 40;
  if (!isChop && overallBias !== 'neutral' && alignmentScore > 60) rawContinuation = 60 + (alignmentScore - 60) * 0.25;
  else if (isChop) rawContinuation = 25;

  let rawReversal = 25;
  if (exhaustionSig || trappedLong || trappedShort || lateBreakout) rawReversal = 45 + (alignmentScore < 50 ? 10 : 0);

  let rawSqueeze = 15;
  if (compressionSig) rawSqueeze = 35;

  let rawChop = 100 - rawContinuation - rawReversal - rawSqueeze;
  if (rawChop < 0) rawChop = 0;

  const total = rawContinuation + rawReversal + rawSqueeze + rawChop;
  const continuationPct = Math.round((rawContinuation / total) * 100);
  const reversalPct     = Math.round((rawReversal / total) * 100);
  const squeezePct      = Math.round((rawSqueeze / total) * 100);
  const chopPct         = Math.max(0, 100 - continuationPct - reversalPct - squeezePct);

  const lowerVsHigherConflict = shortBias !== 'neutral' && longBias !== 'neutral' && shortBias !== longBias;
  const conflictWarning = lowerVsHigherConflict
    ? `Short-term bias (${shortBias}) conflicts with higher timeframe bias (${longBias}) — counter-trend risk elevated`
    : null;

  return { alignmentScore, continuationPct, reversalPct, squeezePct, chopPct, lowerVsHigherConflict, conflictWarning };
}

// ─── Section 4: Power Hour Liquidity Forecast ────────────────────────────────

interface ForecastWindow {
  label: string;
  timeRange: string;
  description: string;
}

interface PHForecast {
  scenario: string;
  scenarioLabel: string;
  scenarioDescription: string;
  windows: ForecastWindow[];
  institutionalClosing: boolean;
  profitTakingRisk: boolean;
  trappedTraderRisk: boolean;
  qqqSpyDivergence: string | null;
}

function computePHForecast(
  candles5m: CandleData[],
  vwap: number,
  atr: number,
  overallBias: 'bullish' | 'bearish' | 'neutral',
  emotionalSignals: EmotionalSignal[],
  vixPrice: number,
  rsi: number | null,
  companionSymbol: string,
  companionChangePct: number,
  mainChangePct: number,
  continuationPct: number,
): PHForecast {
  const n = candles5m.length;
  const last = n > 0 ? candles5m[n - 1] : null;
  const last5 = candles5m.slice(Math.max(0, n - 5));

  const fomoSig       = emotionalSignals.find(s => s.type === 'fomo_buying' && s.detected);
  const panicSig      = emotionalSignals.find(s => s.type === 'panic_selling' && s.detected);
  const trappedLong   = emotionalSignals.find(s => s.type === 'trapped_long' && s.detected);
  const trappedShort  = emotionalSignals.find(s => s.type === 'trapped_short' && s.detected);
  const lateBreakout  = emotionalSignals.find(s => s.type === 'late_breakout_trap' && s.detected);
  const exhaustion    = emotionalSignals.find(s => s.type === 'exhaustion_buying' && s.detected);
  const compression   = emotionalSignals.find(s => s.type === 'compression_expansion' && s.detected);

  const aboveVwap = last ? last.close > vwap : false;
  const nearVwap  = last5.length > 0 && last5.every(c => Math.abs(c.close - vwap) / vwap < 0.002);

  let scenario = 'mixed';
  let scenarioLabel = 'Mixed / Unclear';
  let scenarioDescription = 'No dominant signal — wait for price to declare direction';

  if (trappedShort && fomoSig && aboveVwap && overallBias === 'bullish') {
    scenario = 'late_day_squeeze';
    scenarioLabel = 'Late-Day Squeeze';
    scenarioDescription = 'Likely late-day squeeze — trapped shorts covering, momentum accelerating';
  } else if (trappedLong && panicSig && !aboveVwap && overallBias === 'bearish') {
    scenario = 'liquidity_flush';
    scenarioLabel = 'Liquidity Flush';
    scenarioDescription = 'Likely liquidity flush — weak hands exiting, stops being triggered';
  } else if (!fomoSig && !panicSig && !exhaustion && nearVwap) {
    scenario = 'high_prob_chop';
    scenarioLabel = 'High Probability Chop';
    scenarioDescription = 'High probability chop — avoid scalping, no clear directional edge';
  } else if (overallBias !== 'neutral' && !exhaustion && !lateBreakout && continuationPct > 60) {
    scenario = 'trend_continuation';
    scenarioLabel = 'Trend Continuation';
    scenarioDescription = 'Trend continuation favored into close';
  }

  const accDesc = scenario === 'late_day_squeeze'
    ? 'Shorts likely covering, accumulation happening — watch for dip buyers stepping in'
    : scenario === 'liquidity_flush'
    ? 'Smart money absorbing — potential washout bottom before any bounce'
    : scenario === 'high_prob_chop'
    ? 'Range-bound accumulation — no directional commitment, avoid chasing'
    : scenario === 'trend_continuation'
    ? `Trend building steam — ${overallBias} bias strengthening on multiple timeframes`
    : 'No clear accumulation signal — wait for volume confirmation';

  const emotDesc = scenario === 'late_day_squeeze'
    ? 'Trapped shorts forced to exit — emotional selling may pause momentum briefly before continuation'
    : scenario === 'liquidity_flush'
    ? 'Weak hands panicking — emotional exits creating supply, bears gaining control'
    : scenario === 'high_prob_chop'
    ? 'Low emotional engagement — market in balance, scalp risk high'
    : compression
    ? 'Compression breakout imminent — direction will be decided with volume'
    : 'Watch for VWAP reclaim or rejection to determine emotional bias';

  const trendDesc = scenario === 'late_day_squeeze'
    ? 'Momentum acceleration expected — target session high extension'
    : scenario === 'liquidity_flush'
    ? 'Sellers in control into close — risk of waterfall breakdown'
    : scenario === 'trend_continuation'
    ? `${overallBias === 'bullish' ? 'Bulls' : 'Bears'} accelerating — institutional closing flow in dominant direction`
    : 'Low-confidence directional window — reduce size if trading';

  const windows: ForecastWindow[] = [
    { label: 'Accumulation', timeRange: '2:45–3:10 PM ET', description: accDesc },
    { label: 'Emotional Exit Window', timeRange: '3:10–3:40 PM ET', description: emotDesc },
    { label: 'Trend Acceleration', timeRange: '3:40–4:00 PM ET', description: trendDesc },
  ];

  const institutionalClosing = n > 5 && overallBias === 'bearish' && !aboveVwap;
  const profitTakingRisk = last != null && last.close > (last ? Math.max(...candles5m.slice(Math.max(0, n - 20)).map(c => c.high)) * 0.995 : vwap) && rsi != null && rsi > 65;
  const trappedTraderRisk = !!(trappedLong || trappedShort || lateBreakout);

  const divThreshold = 0.5;
  let qqqSpyDivergence: string | null = null;
  if (Math.abs(companionChangePct - mainChangePct) > divThreshold) {
    const compDir = companionChangePct > mainChangePct ? 'stronger' : 'weaker';
    qqqSpyDivergence = `${companionSymbol} ${compDir} — divergence may signal broad market rotation`;
  }

  return { scenario, scenarioLabel, scenarioDescription, windows, institutionalClosing, profitTakingRisk, trappedTraderRisk, qqqSpyDivergence };
}

// ─── Section 5: Smart Scalp Strike Selector ──────────────────────────────────

interface ScalpContract {
  strike: number;
  contractType: 'call' | 'put';
  tier: 'safer' | 'aggressive';
  approxDelta: number;
  rationale: string;
  momentumFavored: boolean;
  trapRisk: boolean;
}

interface ScalpStrikes {
  callWatchlist: ScalpContract[];
  putWatchlist: ScalpContract[];
  dominantSide: string;
  trapRiskSide: string;
  zeroDteWarning: string | null;
}

function computeScalpStrikes(
  price: number,
  atr: number,
  bias: 'bullish' | 'bearish' | 'neutral',
  vix: number,
  emotionalSignals: EmotionalSignal[],
  isChop: boolean,
): ScalpStrikes {
  const atmStrike = Math.round(price / 0.5) * 0.5;
  const atmRounded = Math.round(atmStrike);

  const exhaustion  = emotionalSignals.find(s => s.type === 'exhaustion_buying' && s.detected);
  const lateBreak   = emotionalSignals.find(s => s.type === 'late_breakout_trap' && s.detected);
  const panicSell   = emotionalSignals.find(s => s.type === 'panic_selling' && s.detected);

  const callTrapRisk = !!(exhaustion || lateBreak);
  const putTrapRisk  = !!panicSell;

  const callWatchlist: ScalpContract[] = [
    {
      strike: atmRounded, contractType: 'call', tier: 'safer', approxDelta: 0.50,
      rationale: bias === 'bullish' ? 'High probability watch — momentum favored' : 'Wait for confirmation before entry',
      momentumFavored: bias === 'bullish',
      trapRisk: callTrapRisk,
    },
    {
      strike: atmRounded + 1, contractType: 'call', tier: 'aggressive', approxDelta: 0.30,
      rationale: bias === 'bullish' ? 'Aggressive OTM — breakout play if momentum extends' : 'Wait for confirmation before entry',
      momentumFavored: bias === 'bullish' && !callTrapRisk,
      trapRisk: callTrapRisk,
    },
    {
      strike: atmRounded + 2, contractType: 'call', tier: 'aggressive', approxDelta: 0.25,
      rationale: 'Deep OTM — only viable on high-conviction breakouts',
      momentumFavored: false,
      trapRisk: callTrapRisk,
    },
  ];

  const putWatchlist: ScalpContract[] = [
    {
      strike: atmRounded, contractType: 'put', tier: 'safer', approxDelta: -0.50,
      rationale: bias === 'bearish' ? 'High probability watch — momentum favored' : 'Wait for confirmation before entry',
      momentumFavored: bias === 'bearish',
      trapRisk: putTrapRisk,
    },
    {
      strike: atmRounded - 1, contractType: 'put', tier: 'aggressive', approxDelta: -0.30,
      rationale: bias === 'bearish' ? 'Aggressive OTM — breakdown play if selling extends' : 'Wait for confirmation before entry',
      momentumFavored: bias === 'bearish' && !putTrapRisk,
      trapRisk: putTrapRisk,
    },
    {
      strike: atmRounded - 2, contractType: 'put', tier: 'aggressive', approxDelta: -0.25,
      rationale: 'Deep OTM — only viable on high-conviction breakdowns',
      momentumFavored: false,
      trapRisk: putTrapRisk,
    },
  ];

  const dominantSide = bias === 'bullish' ? 'calls' : bias === 'bearish' ? 'puts' : 'neutral';
  const trapRiskSide = callTrapRisk ? 'calls' : putTrapRisk ? 'puts' : 'neither';

  let zeroDteWarning: string | null = null;
  if (vix > 20) zeroDteWarning = '0DTE premium is expensive — use 1-2 DTE minimum';
  else if (isChop) zeroDteWarning = 'No clear trend — avoid 0DTE';

  return { callWatchlist, putWatchlist, dominantSide, trapRiskSide, zeroDteWarning };
}

// ─── Section 6: Entry Confirmation Logic ─────────────────────────────────────

interface ConfirmationCheck {
  label: string;
  met: boolean;
}

interface EntryConfirmation {
  bullish: ConfirmationCheck[];
  bearish: ConfirmationCheck[];
  alertStatus: 'CONFIRMED' | 'TRAP_RISK' | 'NO_TRADE' | 'WAIT';
  waitingFor: string;
}

function computeEntryConfirmation(
  candles: CandleData[],
  vwap: number,
  ema9: number | null,
  bias: 'bullish' | 'bearish' | 'neutral',
  emotionalSignals: EmotionalSignal[],
): EntryConfirmation {
  const n = candles.length;
  if (n < 2) {
    return {
      bullish: [], bearish: [],
      alertStatus: 'NO_TRADE',
      waitingFor: 'Insufficient data — need more candles',
    };
  }
  const last = candles[n - 1];
  const prior = candles.slice(Math.max(0, n - 5));
  const priorLows  = prior.slice(0, -1).map(c => c.low);
  const priorHighs = prior.slice(0, -1).map(c => c.high);

  const trappedLongSig  = emotionalSignals.find(s => s.type === 'trapped_long' && s.detected);
  const trappedShortSig = emotionalSignals.find(s => s.type === 'trapped_short' && s.detected);
  const lateBreakSig    = emotionalSignals.find(s => s.type === 'late_breakout_trap' && s.detected);
  const panicSig        = emotionalSignals.find(s => s.type === 'panic_selling' && s.detected);

  const bullish: ConfirmationCheck[] = [
    { label: 'VWAP Reclaim', met: last.close > vwap },
    { label: 'Higher Low', met: priorLows.length > 0 && last.low > Math.min(...priorLows) },
    { label: 'EMA9 Support Hold', met: ema9 != null && last.close > ema9 },
    { label: 'Momentum Candle', met: last.close > last.open && (last.high - last.low) / last.close > 0.002 },
    { label: 'No Trap Signals', met: !trappedLongSig && !lateBreakSig },
  ];

  const bearish: ConfirmationCheck[] = [
    { label: 'VWAP Rejection', met: last.close < vwap },
    { label: 'Lower High', met: priorHighs.length > 0 && last.high < Math.max(...priorHighs) },
    { label: 'EMA9 Breakdown', met: ema9 != null && last.close < ema9 },
    { label: 'Momentum Candle Down', met: last.close < last.open && (last.high - last.low) / last.close > 0.002 },
    { label: 'No Trap Signals', met: !trappedShortSig && !panicSig },
  ];

  const relevantChecks = bias === 'bullish' ? bullish : bias === 'bearish' ? bearish : [];
  const metCount = relevantChecks.filter(c => c.met).length;

  const hasTrapSignal = !!(trappedLongSig || trappedShortSig || lateBreakSig);

  let alertStatus: EntryConfirmation['alertStatus'] = 'WAIT';
  if (bias === 'neutral') alertStatus = 'NO_TRADE';
  else if (hasTrapSignal) alertStatus = 'TRAP_RISK';
  else if (metCount >= 4) alertStatus = 'CONFIRMED';
  else alertStatus = 'WAIT';

  const missing = relevantChecks.filter(c => !c.met).map(c => c.label);
  const waitingFor = missing.length > 0
    ? `Waiting for: ${missing.join(', ')}`
    : alertStatus === 'CONFIRMED' ? 'All confirmations met — monitor for entry' : 'No clear bias — stand aside';

  return { bullish, bearish, alertStatus, waitingFor };
}

// ─── Section 7: Smart Order Builder ──────────────────────────────────────────

interface OrderPlan {
  direction: 'long' | 'short' | null;
  entryNote: string;
  entry: number;
  invalidation: number;
  tp1: number;
  tp2: number;
  riskPct: number;
  rewardPct: number;
  rr: string;
  suggestedOrderType: string;
  momentumStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  trailingStopIdea: string;
}

function computeOrderPlan(
  price: number,
  atr: number,
  bias: 'bullish' | 'bearish' | 'neutral',
  alertStatus: string,
  continuationPct: number,
): OrderPlan {
  if (bias === 'neutral' || alertStatus === 'NO_TRADE') {
    return {
      direction: null, entryNote: 'No trade — wait for directional bias', entry: 0,
      invalidation: 0, tp1: 0, tp2: 0, riskPct: 0, rewardPct: 0, rr: 'N/A',
      suggestedOrderType: 'Stand aside', momentumStrength: 'weak',
      trailingStopIdea: 'No position — no trailing stop needed',
    };
  }

  const dir = bias === 'bullish' ? 1 : -1;
  const entry = alertStatus === 'CONFIRMED' ? r2(price) : r2(price * (1 - dir * 0.001));
  const stop  = r2(entry - dir * 0.3 * atr);
  const tp1   = r2(entry + dir * 0.5 * atr);
  const tp2   = r2(entry + dir * 1.0 * atr);

  const risk   = Math.abs(entry - stop);
  const reward = Math.abs(tp2 - entry);
  const riskPct   = r2((risk / entry) * 100);
  const rewardPct = r2((reward / entry) * 100);
  const rrRatio   = risk > 0 ? r2(reward / risk) : 0;

  const momentumStrength: OrderPlan['momentumStrength'] =
    continuationPct > 65 ? 'strong' :
    continuationPct > 55 ? 'moderate' :
    continuationPct > 45 ? 'weak' : 'very_strong';

  return {
    direction: bias === 'bullish' ? 'long' : 'short',
    entryNote: alertStatus === 'CONFIRMED' ? 'Market entry — all confirmations met' : 'Limit entry — wait for 0.1% pullback',
    entry, invalidation: stop, tp1, tp2,
    riskPct, rewardPct, rr: `${rrRatio}:1`,
    suggestedOrderType: alertStatus === 'CONFIRMED' ? 'Market order + OCO bracket' : 'Limit order + stop-limit OCO bracket',
    momentumStrength,
    trailingStopIdea: 'Trail to breakeven after TP1 hit, then trail by 0.2 ATR',
  };
}

// ─── Section 8: Profit Protection ────────────────────────────────────────────

function computeProfitProtection(
  emotionalSignals: EmotionalSignal[],
  vixPrice: number,
  rsi: number | null,
  etMinutes: number,
): { warnings: string[]; encouragements: string[] } {
  const warnings: string[] = [];

  const fomoSig      = emotionalSignals.find(s => s.type === 'fomo_buying' && s.detected);
  const exhaustion   = emotionalSignals.find(s => s.type === 'exhaustion_buying' && s.detected);
  const lateBreak    = emotionalSignals.find(s => s.type === 'late_breakout_trap' && s.detected);

  if (fomoSig) warnings.push('Do not chase — momentum already expanded');
  if (vixPrice > 20) warnings.push('High IV risk — option premium inflated');
  if (rsi != null && rsi > 70) warnings.push('Momentum already expanded — wait for pullback');
  if (vixPrice > 22) warnings.push('Spread widening risk — use limit orders only');
  if (etMinutes >= 720 && etMinutes <= 840) warnings.push('Low liquidity window — 12–2 PM ET chop zone');
  if (exhaustion) warnings.push('Trend exhaustion likely — reduce size');
  if (lateBreak) warnings.push('Trap risk high — confirmation required before entry');

  const encouragements = [
    'Take base hits — 0.3-0.5 ATR targets are realistic scalp profits',
    'Scale out at TP1, let runner work to TP2',
    'Protect capital — a flat trade is better than a loss',
    'Avoid emotional holding past your plan',
    'One good trade beats three forced trades',
  ];

  return { warnings, encouragements };
}

// ─── Section 10: Final Decision Box ──────────────────────────────────────────

interface FinalDecision {
  currentBias: string;
  trendStrength: string;
  liquidityDirection: string;
  trapRisk: 'low' | 'medium' | 'high';
  mostLikelyScenario: string;
  bestSetup: string;
  bestTimeWindow: string;
  confirmationNeeded: string;
  suggestedContractZone: string;
  riskLevel: 'low' | 'medium' | 'high';
  confidenceScore: number;
  alertStatus: 'WAIT' | 'CONFIRMED' | 'TRAP_RISK' | 'HIGH_MOMENTUM' | 'NO_TRADE';
}

function computeFinalDecision(
  overallBias: 'bullish' | 'bearish' | 'neutral',
  trendScore: number,
  alignedCount: number,
  totalTFs: number,
  liquidityLevels: LiquidityLevel[],
  currentPrice: number,
  emotionalSignals: EmotionalSignal[],
  forecast: PHForecast,
  strikes: ScalpStrikes,
  entryConfirmation: EntryConfirmation,
  continuationPct: number,
  vixPrice: number,
  orderPlan: OrderPlan,
): FinalDecision {
  const biasPct = Math.round(trendScore);
  const currentBias = `${overallBias.charAt(0).toUpperCase() + overallBias.slice(1)} (${biasPct}/100)`;
  const trendStrength = alignedCount >= 6 ? `Strong — ${alignedCount}/${totalTFs} timeframes aligned` :
    alignedCount >= 4 ? `Moderate — ${alignedCount}/${totalTFs} timeframes aligned` :
    `Weak — only ${alignedCount}/${totalTFs} timeframes aligned`;

  const nearestAbove = liquidityLevels.find(l => l.isAbove);
  const nearestBelow = liquidityLevels.find(l => !l.isAbove);
  let liquidityDirection = 'No clear sweep target identified';
  if (nearestAbove && overallBias === 'bullish') {
    liquidityDirection = `Upside sweep likely — equal highs at $${nearestAbove.price}`;
  } else if (nearestBelow && overallBias === 'bearish') {
    liquidityDirection = `Downside sweep likely — equal lows at $${nearestBelow.price}`;
  } else if (nearestAbove) {
    liquidityDirection = `Nearest liquidity above: $${nearestAbove.price} (${nearestAbove.label})`;
  } else if (nearestBelow) {
    liquidityDirection = `Nearest liquidity below: $${nearestBelow.price} (${nearestBelow.label})`;
  }

  const trappedSigs = emotionalSignals.filter(s => (s.type === 'trapped_long' || s.type === 'trapped_short' || s.type === 'late_breakout_trap') && s.detected);
  const trapRisk: 'low' | 'medium' | 'high' = trappedSigs.length >= 2 ? 'high' : trappedSigs.length === 1 ? 'medium' : 'low';

  const bestWindow = forecast.windows[1].timeRange;
  const confirmationNeeded = entryConfirmation.waitingFor;
  const contractZone = strikes.dominantSide === 'calls'
    ? `Watch $${strikes.callWatchlist[0]?.strike ?? '—'} calls (safer) or $${strikes.callWatchlist[1]?.strike ?? '—'} calls (aggressive)`
    : strikes.dominantSide === 'puts'
    ? `Watch $${strikes.putWatchlist[0]?.strike ?? '—'} puts (safer) or $${strikes.putWatchlist[1]?.strike ?? '—'} puts (aggressive)`
    : 'No dominant side — wait for direction';

  const riskLevel: 'low' | 'medium' | 'high' =
    vixPrice > 22 || trapRisk === 'high' ? 'high' :
    vixPrice > 17 || trapRisk === 'medium' ? 'medium' : 'low';

  const confScore = Math.max(0, Math.min(100, Math.round(
    continuationPct * 0.4 + (alignedCount / totalTFs * 100) * 0.3 + (trapRisk === 'low' ? 30 : trapRisk === 'medium' ? 15 : 0)
  )));

  const rawAlert = entryConfirmation.alertStatus;
  let alertStatus: FinalDecision['alertStatus'] = rawAlert as FinalDecision['alertStatus'];
  if (rawAlert === 'CONFIRMED' && continuationPct > 65) alertStatus = 'HIGH_MOMENTUM';

  return {
    currentBias,
    trendStrength,
    liquidityDirection,
    trapRisk,
    mostLikelyScenario: forecast.scenarioDescription,
    bestSetup: forecast.scenarioLabel,
    bestTimeWindow: bestWindow,
    confirmationNeeded,
    suggestedContractZone: contractZone,
    riskLevel,
    confidenceScore: confScore,
    alertStatus,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol = (sp.get('symbol')?.toUpperCase() ?? 'SPY') as string;

  try {
    const companionSymbol = symbol === 'QQQ' ? 'SPY' : 'QQQ';

    const fetches = await Promise.allSettled([
      fetchYFCandles(symbol, '5m',  '2d'),   // 0
      fetchYFCandles(symbol, '15m', '5d'),   // 1
      fetchYFCandles(symbol, '1h',  '1mo'),  // 2
      fetchYFCandles(symbol, '1d',  '6mo'),  // 3
      fetchYFCandles(symbol, '1wk', '2y'),   // 4
      fetchYFQuote(symbol),                  // 5
      fetchYFQuote(companionSymbol),         // 6
      fetchYFQuote('^VIX'),                  // 7
      fetchYFQuote('DX-Y.NYB'),              // 8
      fetchYFQuote('^TNX'),                  // 9
    ]);

    const getCandles = (idx: number): CandleData[] => {
      const r = fetches[idx];
      return r.status === 'fulfilled' ? (r.value as CandleData[]) : [];
    };
    const getQuote = (idx: number) => {
      const r = fetches[idx];
      return r.status === 'fulfilled' ? (r.value as { price: number; prevClose: number; change: number; changePct: number } | null) : null;
    };

    const candles5m    = getCandles(0);
    const candles15m   = getCandles(1);
    const candles1h    = getCandles(2);
    const candlesDaily = getCandles(3);
    const candlesWeek  = getCandles(4);
    const mainQuote    = getQuote(5);
    const companionQ   = getQuote(6);
    const vixQ         = getQuote(7);
    const dxyQ         = getQuote(8);
    const tnxQ         = getQuote(9);

    const current5m    = candles5m.length  > 0 ? candles5m[candles5m.length - 1].close  : 0;
    const current15m   = candles15m.length > 0 ? candles15m[candles15m.length - 1].close : 0;
    const currentPrice = current5m > 0 ? current5m : (mainQuote?.price ?? current15m);

    if (currentPrice === 0) {
      return NextResponse.json({ success: false, error: 'No price data available — market may be closed' }, { status: 503 });
    }

    // RTH open
    const rthTs  = rthOpenTsToday();
    const today5m = candles5m.filter(c => c.time >= rthTs);

    // VWAP + ATR
    const vwap5m = today5m.length > 5 ? calcVWAP(today5m) : calcVWAP(candles5m.slice(-30));
    const atr5m  = calcATR(candles5m, 14);

    // TF analysis
    const tf5m   = analyzeTF('5m',     candles5m);
    const tf15m  = analyzeTF('15m',    candles15m);
    const tf1h   = analyzeTF('1H',     candles1h);
    const tfDay  = analyzeTF('Daily',  candlesDaily);
    const tfWeek = analyzeTF('Weekly', candlesWeek);
    const allTFs = [tf5m, tf15m, tf1h, tfDay, tfWeek];
    const tfScores = allTFs.map(t => t.score);
    const avgScore = tfScores.reduce((s, v) => s + v, 0) / tfScores.length;
    const overallBias: 'bullish' | 'bearish' | 'neutral' =
      avgScore >= 62 ? 'bullish' : avgScore <= 38 ? 'bearish' : 'neutral';

    const shortBias = tf5m.bias !== 'neutral' ? tf5m.bias : tf15m.bias;
    const longBias  = tfDay.bias !== 'neutral' ? tfDay.bias : tfWeek.bias;

    const rsi5m = tf5m.rsi;
    const ema9  = tf5m.ema9;

    // ET time in minutes
    const nowUtc = new Date();
    const etOffset = etOffsetHours();
    const etMs   = nowUtc.getTime() + etOffset * 3600000;
    const etDate = new Date(etMs);
    const etMinutes = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();

    // Chop detection (simple)
    const rthN = today5m.length;
    const isChop = (() => {
      if (rthN < 14) return false;
      const recent = today5m.slice(-14);
      const nearVwapAll = recent.every(c => Math.abs(c.close - vwap5m) / vwap5m < 0.002);
      return nearVwapAll && rsi5m != null && rsi5m >= 44 && rsi5m <= 56;
    })();

    // Section 1
    const liquidityLevels = computeLiquidityLevels(currentPrice, candlesDaily, candles5m, rthTs, vwap5m, atr5m);

    // Section 2
    const emotionalSignals = detectEmotionalExits(today5m.length > 5 ? today5m : candles5m, rsi5m, vwap5m, atr5m);
    const detectedSignals  = emotionalSignals.filter(s => s.detected);
    const summaryLabelsRaw = detectedSignals.map(s => s.label);
    const summaryLabels    = summaryLabelsRaw.filter((v, i, arr) => arr.indexOf(v) === i);
    const dominantCondition = detectedSignals.length === 0 ? 'Orderly market — no emotional extremes detected' :
      detectedSignals.sort((a, b) => (a.severity === 'high' ? 0 : a.severity === 'medium' ? 1 : 2) - (b.severity === 'high' ? 0 : b.severity === 'medium' ? 1 : 2))[0].label;

    // Section 3
    const alignedCount = allTFs.filter(t => t.bias === overallBias).length;
    const continuation = computeContinuationProb(tfScores, overallBias, isChop, emotionalSignals, shortBias, longBias);

    // Section 4
    const vixPrice = vixQ?.price ?? 0;
    const forecast = computePHForecast(
      candles5m, vwap5m, atr5m, overallBias, emotionalSignals,
      vixPrice, rsi5m, companionSymbol,
      companionQ?.changePct ?? 0, mainQuote?.changePct ?? 0,
      continuation.continuationPct,
    );

    // Section 5
    const strikes = computeScalpStrikes(currentPrice, atr5m, overallBias, vixPrice, emotionalSignals, isChop);

    // Section 6
    const entryConf = computeEntryConfirmation(today5m.length > 2 ? today5m : candles5m, vwap5m, ema9, overallBias, emotionalSignals);

    // Section 7
    const orderPlan = computeOrderPlan(currentPrice, atr5m, overallBias, entryConf.alertStatus, continuation.continuationPct);

    // Section 8
    const protection = computeProfitProtection(emotionalSignals, vixPrice, rsi5m, etMinutes);

    // Section 10
    const decision = computeFinalDecision(
      overallBias, avgScore, alignedCount, allTFs.length,
      liquidityLevels, currentPrice, emotionalSignals,
      forecast, strikes, entryConf,
      continuation.continuationPct, vixPrice, orderPlan,
    );

    return NextResponse.json({
      success: true,
      symbol,
      currentPrice: r2(currentPrice),
      liquidity: liquidityLevels,
      emotional: {
        signals: emotionalSignals,
        summary: summaryLabels,
        dominantCondition,
      },
      continuation: {
        alignmentScore: continuation.alignmentScore,
        continuationPct: continuation.continuationPct,
        reversalPct: continuation.reversalPct,
        squeezePct: continuation.squeezePct,
        chopPct: continuation.chopPct,
        lowerVsHigherConflict: continuation.lowerVsHigherConflict,
        conflictWarning: continuation.conflictWarning,
        tfScores: allTFs.map(t => ({ label: t.label, bias: t.bias, score: t.score })),
      },
      forecast: {
        scenario: forecast.scenario,
        scenarioLabel: forecast.scenarioLabel,
        scenarioDescription: forecast.scenarioDescription,
        windows: forecast.windows,
        institutionalClosing: forecast.institutionalClosing,
        profitTakingRisk: forecast.profitTakingRisk,
        trappedTraderRisk: forecast.trappedTraderRisk,
        qqqSpyDivergence: forecast.qqqSpyDivergence,
      },
      strikes: {
        callWatchlist: strikes.callWatchlist,
        putWatchlist: strikes.putWatchlist,
        dominantSide: strikes.dominantSide,
        trapRiskSide: strikes.trapRiskSide,
        zeroDteWarning: strikes.zeroDteWarning,
      },
      confirmation: {
        bullish: entryConf.bullish,
        bearish: entryConf.bearish,
        alertStatus: entryConf.alertStatus,
        waitingFor: entryConf.waitingFor,
      },
      orderPlan: {
        direction: orderPlan.direction,
        entryNote: orderPlan.entryNote,
        entry: orderPlan.entry,
        invalidation: orderPlan.invalidation,
        tp1: orderPlan.tp1,
        tp2: orderPlan.tp2,
        riskPct: orderPlan.riskPct,
        rewardPct: orderPlan.rewardPct,
        rr: orderPlan.rr,
        suggestedOrderType: orderPlan.suggestedOrderType,
        momentumStrength: orderPlan.momentumStrength,
        trailingStopIdea: orderPlan.trailingStopIdea,
      },
      protection: {
        warnings: protection.warnings,
        encouragements: protection.encouragements,
      },
      decision,
      companions: {
        vix:       vixQ  ? { price: vixQ.price,  changePct: vixQ.changePct  } : null,
        dxy:       dxyQ  ? { price: dxyQ.price,  changePct: dxyQ.changePct  } : null,
        tnx:       tnxQ  ? { price: tnxQ.price,  changePct: tnxQ.changePct  } : null,
        companion: companionQ ? { symbol: companionSymbol, price: companionQ.price, changePct: companionQ.changePct } : null,
      },
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Liquidity engine error',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
