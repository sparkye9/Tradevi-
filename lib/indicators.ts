// Technical indicator calculations
import type { CandleData, StockAnalysis } from './types';

export function calcSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

export function calcEMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

export function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i + 1] = 100 - 100 / (1 + r);
  }
  return result;
}

export function calcATR(candles: CandleData[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function calcVWAP(candles: CandleData[]): number {
  let totalTP = 0, totalVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    totalTP += tp * c.volume;
    totalVol += c.volume;
  }
  return totalVol > 0 ? totalTP / totalVol : 0;
}

export function findSupportResistance(candles: CandleData[], lookback = 20): { support: number; resistance: number } {
  const recent = candles.slice(-lookback);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs),
  };
}

export function findKeyLevels(candles: CandleData[], currentPrice: number): { above: number; below: number } {
  if (candles.length < 10) return { above: currentPrice * 1.02, below: currentPrice * 0.98 };

  const closes = candles.map(c => c.close);
  const pivots: number[] = [];

  for (let i = 2; i < closes.length - 2; i++) {
    const isHigh = closes[i] > closes[i - 1] && closes[i] > closes[i - 2] && closes[i] > closes[i + 1] && closes[i] > closes[i + 2];
    const isLow = closes[i] < closes[i - 1] && closes[i] < closes[i - 2] && closes[i] < closes[i + 1] && closes[i] < closes[i + 2];
    if (isHigh || isLow) pivots.push(closes[i]);
  }

  const above = pivots.filter(p => p > currentPrice * 1.001).sort((a, b) => a - b)[0] ?? currentPrice * 1.03;
  const below = pivots.filter(p => p < currentPrice * 0.999).sort((a, b) => b - a)[0] ?? currentPrice * 0.97;
  return { above, below };
}

export function analyzeStock(candles: CandleData[], symbol: string): StockAnalysis {
  if (candles.length < 5) {
    const price = candles[candles.length - 1]?.close ?? 100;
    return {
      symbol, price, trend: 'neutral', support: price * 0.97, resistance: price * 1.03,
      atr: price * 0.01, rsi: 50, ma20: price, ma50: price, ma200: price,
      volumeChange: 0, bias: 'neutral', keyLevelAbove: price * 1.02, keyLevelBelow: price * 0.98,
      breakoutTrigger: price * 1.02, breakdownTrigger: price * 0.98, invalidationLevel: price * 0.96, trendStrength: 50,
    };
  }

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const price = closes[closes.length - 1];

  const sma20Arr = calcSMA(closes, Math.min(20, closes.length));
  const sma50Arr = calcSMA(closes, Math.min(50, closes.length));
  const sma200Arr = calcSMA(closes, Math.min(200, closes.length));
  const rsiArr = calcRSI(closes);

  const ma20 = sma20Arr[sma20Arr.length - 1] || price;
  const ma50 = sma50Arr[sma50Arr.length - 1] || price;
  const ma200 = sma200Arr[sma200Arr.length - 1] || price;
  const rsi = rsiArr[rsiArr.length - 1] || 50;
  const atr = calcATR(candles);

  const { support, resistance } = findSupportResistance(candles);
  const { above: keyLevelAbove, below: keyLevelBelow } = findKeyLevels(candles, price);

  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVol = volumes[volumes.length - 1];
  const volumeChange = avgVol > 0 ? ((currentVol - avgVol) / avgVol) * 100 : 0;

  const vwap = calcVWAP(candles.slice(-1));

  let trend: 'bullish' | 'bearish' | 'neutral';
  let trendStrength = 50;
  if (price > ma20 && ma20 > ma50 && price > ma50) {
    trend = 'bullish';
    trendStrength = Math.min(100, 50 + (rsi - 50) * 0.8);
  } else if (price < ma20 && ma20 < ma50 && price < ma50) {
    trend = 'bearish';
    trendStrength = Math.min(100, 50 + (50 - rsi) * 0.8);
  } else {
    trend = 'neutral';
    trendStrength = 40 + Math.abs(rsi - 50) * 0.4;
  }

  let bias: 'bullish' | 'bearish' | 'neutral';
  const bullishPoints = [price > ma20, price > ma50, rsi > 50, price > support + (resistance - support) * 0.5, volumeChange > 10].filter(Boolean).length;
  const bearishPoints = [price < ma20, price < ma50, rsi < 50, price < support + (resistance - support) * 0.5, volumeChange < -10].filter(Boolean).length;
  if (bullishPoints > bearishPoints + 1) bias = 'bullish';
  else if (bearishPoints > bullishPoints + 1) bias = 'bearish';
  else bias = 'neutral';

  const breakoutTrigger = Math.max(resistance, keyLevelAbove) * 0.998;
  const breakdownTrigger = Math.min(support, keyLevelBelow) * 1.002;
  const invalidationLevel = trend === 'bullish' ? ma50 * 0.99 : trend === 'bearish' ? ma50 * 1.01 : price * 0.97;

  return {
    symbol, price, trend, support: Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100, atr: Math.round(atr * 100) / 100,
    rsi: Math.round(rsi * 10) / 10, ma20: Math.round(ma20 * 100) / 100,
    ma50: Math.round(ma50 * 100) / 100, ma200: Math.round(ma200 * 100) / 100,
    volumeChange: Math.round(volumeChange * 10) / 10, vwap: Math.round(vwap * 100) / 100,
    bias, keyLevelAbove: Math.round(keyLevelAbove * 100) / 100,
    keyLevelBelow: Math.round(keyLevelBelow * 100) / 100,
    breakoutTrigger: Math.round(breakoutTrigger * 100) / 100,
    breakdownTrigger: Math.round(breakdownTrigger * 100) / 100,
    invalidationLevel: Math.round(invalidationLevel * 100) / 100, trendStrength: Math.round(trendStrength),
  };
}
