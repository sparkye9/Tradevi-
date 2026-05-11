/**
 * Client-side indicator calculations.
 * Produces the full IndicatorData + StockAnalysis from raw candles.
 * Used by the Next.js fallback route and optionally for period overrides.
 */
import type { CandleData } from './types';
import type { IndicatorData, StockAnalysis } from './apiClient';
import type { IndicatorConfig } from '../components/charts/chartTypes';

// ─── Primitive helpers ────────────────────────────────────────────────────────

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

function rma(values: number[], period: number): number[] {
  const result = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + values[i]) / period;
  }
  return result;
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period; avgLoss /= period;
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? 1e9 : avgGain / avgLoss));
  for (let i = period; i < changes.length; i++) {
    const g = changes[i] > 0 ? changes[i] : 0;
    const l = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    result[i + 1] = 100 - 100 / (1 + (avgLoss === 0 ? 1e9 : avgGain / avgLoss));
  }
  return result;
}

function calcATRArr(candles: CandleData[], period: number): (number | null)[] {
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  return rma(trs, period).map(v => (isNaN(v) ? null : v));
}

function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine: (number | null)[] = fastEma.map((f, i) =>
    f !== null && slowEma[i] !== null ? f - (slowEma[i] as number) : null
  );
  const macdValues = macdLine.map(v => v ?? NaN);
  const signalEma = ema(macdValues, signal);
  const hist: (number | null)[] = macdLine.map((m, i) =>
    m !== null && signalEma[i] !== null ? m - (signalEma[i] as number) : null
  );
  return { macdLine, signalLine: signalEma, hist };
}

function calcBollinger(closes: number[], period = 20, stdMult = 2) {
  const mid: (number | null)[] = new Array(closes.length).fill(null);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const m = slice.reduce((a, b) => a + b) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    mid[i] = m;
    upper[i] = m + stdMult * std;
    lower[i] = m - stdMult * std;
  }
  return { upper, mid, lower };
}

function calcVWAP(candles: CandleData[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumTpVol = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTpVol += tp * (c.volume || 0);
    cumVol += c.volume || 0;
    result.push(cumVol > 0 ? cumTpVol / cumVol : null);
  }
  return result;
}

function calcSuperTrendArr(candles: CandleData[], period = 10, factor = 3.0) {
  const n = candles.length;
  const trs: number[] = [0];
  for (let i = 1; i < n; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  const atr = rma(trs, period);
  const dir = new Array(n).fill(1);
  const line: (number | null)[] = new Array(n).fill(null);
  let upBand = 0, dnBand = 0;
  for (let i = 1; i < n; i++) {
    if (isNaN(atr[i])) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const newUp = hl2 - factor * atr[i];
    const newDn = hl2 + factor * atr[i];
    upBand = candles[i - 1].close > upBand ? Math.max(newUp, upBand) : newUp;
    dnBand = candles[i - 1].close < dnBand ? Math.min(newDn, dnBand) : newDn;
    dir[i] = candles[i].close > dnBand ? 1 : candles[i].close < upBand ? -1 : dir[i - 1];
    line[i] = dir[i] === 1 ? upBand : dnBand;
  }
  return { dir, line };
}

function calcAroon(candles: CandleData[], period = 14) {
  const n = candles.length;
  const up: (number | null)[] = new Array(n).fill(null);
  const down: (number | null)[] = new Array(n).fill(null);
  const osc: (number | null)[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    const sl = candles.slice(i - period, i + 1);
    const hiIdx = sl.reduce((best, c, j) => c.high > sl[best].high ? j : best, 0);
    const loIdx = sl.reduce((best, c, j) => c.low < sl[best].low ? j : best, 0);
    up[i] = (hiIdx / period) * 100;
    down[i] = (loIdx / period) * 100;
    osc[i] = (up[i] as number) - (down[i] as number);
  }
  return { up, down, osc };
}

function calcDMI(candles: CandleData[], period = 14) {
  const n = candles.length;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const trs: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  const atr = rma(trs, period);
  const sp = rma(plusDM, period);
  const sm = rma(minusDM, period);
  const diPlus: (number | null)[] = atr.map((a, i) => isNaN(a) || a === 0 ? null : (sp[i] / a) * 100);
  const diMinus: (number | null)[] = atr.map((a, i) => isNaN(a) || a === 0 ? null : (sm[i] / a) * 100);
  const dx = diPlus.map((p, i) => {
    const m = diMinus[i];
    if (p === null || m === null) return NaN;
    const sum = p + m;
    return sum === 0 ? 0 : (Math.abs(p - m) / sum) * 100;
  });
  const adxArr = rma(dx, period).map(v => (isNaN(v) ? null : v));
  return { diPlus, diMinus, adx: adxArr };
}

function calcLRSI(closes: number[], gamma = 0.5): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
  for (let i = 1; i < n; i++) {
    l0 = (1 - gamma) * closes[i] + gamma * l0;
    l1 = -gamma * l0 + l0 + gamma * l1;
    l2 = -gamma * l1 + l1 + gamma * l2;
    l3 = -gamma * l2 + l2 + gamma * l3;
    let cu = 0, cd = 0;
    if (l0 >= l1) cu += l0 - l1; else cd += l1 - l0;
    if (l1 >= l2) cu += l1 - l2; else cd += l2 - l1;
    if (l2 >= l3) cu += l2 - l3; else cd += l3 - l2;
    result[i] = cu + cd > 0 ? cu / (cu + cd) : 0;
  }
  return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function calcAllIndicators(
  candles: CandleData[],
  configs?: IndicatorConfig[]
): { indicatorData: IndicatorData; analysis: ReturnType<typeof buildAnalysis> } {
  if (candles.length < 2) {
    const empty = buildEmptyIndicators(candles.length);
    return { indicatorData: empty, analysis: buildAnalysis(candles, empty) };
  }

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const vols   = candles.map(c => c.volume || 0);

  const periodFor = (id: string, def: number) =>
    configs?.find(c => c.id === id)?.period ?? def;

  const ema9   = ema(closes, periodFor('ema9', 9));
  const ema20  = ema(closes, periodFor('ema20', 20));
  const ema50  = ema(closes, periodFor('ema50', 50));
  const ema200 = ema(closes, periodFor('ema200', 200));
  const vwap   = calcVWAP(candles);
  const rsi14  = calcRSI(closes, periodFor('rsi', 14));
  const macd   = calcMACD(closes);
  const bb     = calcBollinger(closes, periodFor('bbands', 20));
  const stFast = calcSuperTrendArr(candles, 10, 3.0);
  const stSlow = calcSuperTrendArr(candles, 14, 2.0);
  const aroon  = calcAroon(candles, 14);
  const dmi    = calcDMI(candles, 14);
  const lrsi   = calcLRSI(closes);
  const atr    = calcATRArr(candles, periodFor('atr', 14));

  const indicatorData: IndicatorData = {
    rsi: rsi14,
    ema9, ema20, ema50, ema200, vwap,
    macdLine: macd.macdLine,
    macdSignal: macd.signalLine,
    macdHist: macd.hist,
    bbUpper: bb.upper,
    bbMid: bb.mid,
    bbLower: bb.lower,
    stFastDir: stFast.dir,
    stFastLine: stFast.line,
    stSlowDir: stSlow.dir,
    stSlowLine: stSlow.line,
    aroonUp: aroon.up,
    aroonDown: aroon.down,
    aroonOsc: aroon.osc,
    diPlus: dmi.diPlus,
    diMinus: dmi.diMinus,
    adx: dmi.adx,
    lrsi,
    atr,
  };

  return { indicatorData, analysis: buildAnalysis(candles, indicatorData) };
}

function buildEmptyIndicators(n: number): IndicatorData {
  const e = () => new Array(n).fill(null);
  const ei = () => new Array(n).fill(0);
  return {
    rsi: e(), ema9: e(), ema20: e(), ema50: e(), ema200: e(), vwap: e(),
    macdLine: e(), macdSignal: e(), macdHist: e(),
    bbUpper: e(), bbMid: e(), bbLower: e(),
    stFastDir: ei(), stFastLine: e(), stSlowDir: ei(), stSlowLine: e(),
    aroonUp: e(), aroonDown: e(), aroonOsc: e(),
    diPlus: e(), diMinus: e(), adx: e(), lrsi: e(), atr: e(),
  };
}

export function buildAnalysis(candles: CandleData[], ind: IndicatorData) {
  const last = candles.length - 1;
  if (last < 0) {
    return {
      price: 0, rsi: 50, atr: 0, bias: 'neutral' as const,
      trend: 'neutral' as const, trendStrength: 0,
      support: 0, resistance: 0, breakoutTrigger: 0, breakdownTrigger: 0,
      ma20: 0, ma50: 0, indicators: ind,
      orb: { orb_high: null, orb_low: null },
    };
  }
  const price = candles[last].close;
  const rsiVal = (ind.rsi[last] as number | null) ?? 50;
  const atrVal = (ind.atr[last] as number | null) ?? 0;
  const ma20 = (ind.ema20[last] as number | null) ?? price;
  const ma50 = (ind.ema50[last] as number | null) ?? price;
  const stUp = ind.stFastDir[last] === 1 && ind.stSlowDir[last] === 1;
  const stDn = ind.stFastDir[last] === -1 && ind.stSlowDir[last] === -1;
  const emaBull = ma20 > ma50;
  const diP = (ind.diPlus[last] as number | null) ?? 0;
  const diM = (ind.diMinus[last] as number | null) ?? 0;
  const aroonO = (ind.aroonOsc[last] as number | null) ?? 0;
  const bullSignals = [stUp, emaBull, diP > diM, aroonO > 0].filter(Boolean).length;
  const bearSignals = [stDn, !emaBull, diM > diP, aroonO < 0].filter(Boolean).length;
  const bias = bullSignals >= 3 ? 'bullish' : bearSignals >= 3 ? 'bearish' : 'neutral';
  const recent = candles.slice(-20);
  const resistance = Math.max(...recent.map(c => c.high));
  const support = Math.min(...recent.map(c => c.low));
  return {
    price, rsi: rsiVal, atr: atrVal, bias,
    trend: stUp ? 'bullish' as const : stDn ? 'bearish' as const : 'neutral' as const,
    trendStrength: bullSignals,
    support: Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
    breakoutTrigger: Math.round(resistance * 1.002 * 100) / 100,
    breakdownTrigger: Math.round(support * 0.998 * 100) / 100,
    ma20: Math.round(ma20 * 100) / 100,
    ma50: Math.round(ma50 * 100) / 100,
    indicators: ind,
    orb: { orb_high: null, orb_low: null },
  };
}
