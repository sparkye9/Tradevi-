import type { CandleData } from './types';

// Wilder's Smoothed Moving Average (RMA)
function calcRMA(values: number[], period: number): number[] {
  const result = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + values[i]) / period;
  }
  return result;
}

function calcATRArr(candles: CandleData[], period: number): number[] {
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return calcRMA(trs, period);
}

function calcEMASeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function calcSuperTrend(candles: CandleData[], factor: number, period: number) {
  const n = candles.length;
  const atrArr = calcATRArr(candles, period);
  const trendUp = new Array(n).fill(0);
  const trendDown = new Array(n).fill(0);
  const trend = new Array(n).fill(1);

  for (let i = 0; i < n; i++) {
    if (isNaN(atrArr[i])) {
      trendUp[i] = i > 0 ? trendUp[i - 1] : 0;
      trendDown[i] = i > 0 ? trendDown[i - 1] : 0;
      trend[i] = i > 0 ? trend[i - 1] : 1;
      continue;
    }
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const atr = atrArr[i];
    const stUp = hl2 - factor * atr;
    const stDn = hl2 + factor * atr;

    trendUp[i] = i > 0 && candles[i - 1].close > trendUp[i - 1]
      ? Math.max(stUp, trendUp[i - 1]) : stUp;
    trendDown[i] = i > 0 && candles[i - 1].close < trendDown[i - 1]
      ? Math.min(stDn, trendDown[i - 1]) : stDn;

    if (i === 0) {
      trend[i] = 1;
    } else {
      trend[i] = candles[i].close > trendDown[i - 1] ? 1
        : candles[i].close < trendUp[i - 1] ? -1
        : trend[i - 1];
    }
  }
  return { trendUp, trendDown, trend };
}

function calcRSISeries(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i + 1] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  }
  return result;
}

function calcAroon(candles: CandleData[], length: number) {
  const n = candles.length;
  const aroonUp: (number | null)[] = new Array(n).fill(null);
  const aroonDown: (number | null)[] = new Array(n).fill(null);
  for (let i = length; i < n; i++) {
    let highestIdx = i, lowestIdx = i;
    for (let j = i - length; j <= i; j++) {
      if (candles[j].high > candles[highestIdx].high) highestIdx = j;
      if (candles[j].low < candles[lowestIdx].low) lowestIdx = j;
    }
    aroonUp[i] = 100 * (length - (i - highestIdx)) / length;
    aroonDown[i] = 100 * (length - (i - lowestIdx)) / length;
  }
  return { aroonUp, aroonDown };
}

function calcDMI(candles: CandleData[], length: number) {
  const n = candles.length;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trArr: number[] = [candles[0] ? candles[0].high - candles[0].low : 0];
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trArr.push(Math.max(hl, hc, lc));
  }
  const smoothedTR = calcRMA(trArr, length);
  const smoothedPlus = calcRMA(plusDM, length);
  const smoothedMinus = calcRMA(minusDM, length);
  const diPlus: (number | null)[] = smoothedTR.map((tr, i) =>
    !isNaN(tr) && tr > 0 ? 100 * smoothedPlus[i] / tr : null);
  const diMinus: (number | null)[] = smoothedTR.map((tr, i) =>
    !isNaN(tr) && tr > 0 ? 100 * smoothedMinus[i] / tr : null);
  return { diPlus, diMinus };
}

function calcLRSI(candles: CandleData[], alpha: number, feLength: number, useFE = true): (number | null)[] {
  const n = candles.length;
  const lrsi: (number | null)[] = new Array(n).fill(null);
  const l0 = new Array(n).fill(0);
  const l1 = new Array(n).fill(0);
  const l2 = new Array(n).fill(0);
  const l3 = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    const hc = Math.max(candles[i].high, prevClose);
    const lc = Math.min(candles[i].low, prevClose);
    const feSrc = ((candles[i].open + prevClose) / 2 + hc + lc + candles[i].close) / 4;

    let a = alpha;
    if (useFE && i >= feLength) {
      let totalRange = 0, maxH = -Infinity, minL = Infinity;
      for (let j = i - feLength + 1; j <= i; j++) {
        const pC = j > 0 ? candles[j - 1].close : candles[j].close;
        const hj = Math.max(candles[j].high, pC);
        const lj = Math.min(candles[j].low, pC);
        totalRange += hj - lj;
        maxH = Math.max(maxH, hj);
        minL = Math.min(minL, lj);
      }
      const rangeMax = maxH - minL;
      if (rangeMax > 0 && feLength > 1) {
        const fe = Math.log(totalRange / rangeMax) / Math.log(feLength);
        a = Math.max(0.01, Math.min(0.99, fe));
      }
    }

    const src = useFE ? feSrc : candles[i].close;
    const pL0 = i > 0 ? l0[i - 1] : 0;
    const pL1 = i > 0 ? l1[i - 1] : 0;
    const pL2 = i > 0 ? l2[i - 1] : 0;
    const pL3 = i > 0 ? l3[i - 1] : 0;

    l0[i] = a * src + (1 - a) * pL0;
    l1[i] = -(1 - a) * l0[i] + pL0 + (1 - a) * pL1;
    l2[i] = -(1 - a) * l1[i] + pL1 + (1 - a) * pL2;
    l3[i] = -(1 - a) * l2[i] + pL2 + (1 - a) * pL3;

    const cu = (l0[i] >= l1[i] ? l0[i] - l1[i] : 0) + (l1[i] >= l2[i] ? l1[i] - l2[i] : 0) + (l2[i] >= l3[i] ? l2[i] - l3[i] : 0);
    const cd = (l0[i] >= l1[i] ? 0 : l1[i] - l0[i]) + (l1[i] >= l2[i] ? 0 : l2[i] - l1[i]) + (l2[i] >= l3[i] ? 0 : l3[i] - l2[i]);
    lrsi[i] = cu + cd !== 0 ? cu / (cu + cd) : 0;
  }
  return lrsi;
}

function calcVWAPSeries(candles: CandleData[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    result.push(cumVol > 0 ? cumTPV / cumVol : null);
  }
  return result;
}

export interface TFCParams {
  st1Factor: number;
  st1Period: number;
  st2Factor: number;
  st2Period: number;
  emaFast: number;
  emaSlow: number;
  aroonLength: number;
  dmiLength: number;
  lrsiAlpha: number;
  lrsiFeLength: number;
  threshold: number;
}

export const DEFAULT_TFC_PARAMS: TFCParams = {
  st1Factor: 1.5,
  st1Period: 7,
  st2Factor: 1.65,
  st2Period: 50,
  emaFast: 8,
  emaSlow: 15,
  aroonLength: 8,
  dmiLength: 8,
  lrsiAlpha: 0.7,
  lrsiFeLength: 13,
  threshold: 3,
};

export interface TFCOutput {
  ema20: (number | null)[];
  ema50: (number | null)[];
  vwap: (number | null)[];
  superTrendLine: (number | null)[];
  superTrendDir: (1 | -1 | 0)[];
  rsi: (number | null)[];
  trendStrength: number[];
  entrySignals: { index: number; direction: 1 | -1 }[];
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
  diPlus: (number | null)[];
  diMinus: (number | null)[];
  lrsi: (number | null)[];
}

export function calcTFC(candles: CandleData[], params: TFCParams): TFCOutput {
  const closes = candles.map(c => c.close);
  const n = candles.length;

  const ema20 = calcEMASeries(closes, 20);
  const ema50 = calcEMASeries(closes, 50);
  const emaFast = calcEMASeries(closes, params.emaFast);
  const emaSlow = calcEMASeries(closes, params.emaSlow);
  const vwap = calcVWAPSeries(candles);
  const rsi = calcRSISeries(closes, 14);

  const st1 = calcSuperTrend(candles, params.st1Factor, params.st1Period);
  const st2 = calcSuperTrend(candles, params.st2Factor, params.st2Period);

  // Combine both supertrends: both must agree
  const stDir: (1 | -1 | 0)[] = new Array(n).fill(0);
  const stLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (st1.trend[i] !== 0 && st1.trend[i] === st2.trend[i]) {
      stDir[i] = st1.trend[i] as 1 | -1;
      stLine[i] = stDir[i] === 1
        ? Math.min(st1.trendUp[i], st2.trendUp[i])
        : Math.max(st1.trendDown[i], st2.trendDown[i]);
    }
  }

  const emaTrend: (1 | -1)[] = emaFast.map((f, i) => {
    const s = emaSlow[i];
    return f !== null && s !== null ? (f < s ? -1 : 1) : 1;
  });

  const { aroonUp, aroonDown } = calcAroon(candles, params.aroonLength);
  const aroonTrend: (1 | -1 | 0)[] = new Array(n).fill(0);
  let lastAroonTrend: 1 | -1 | 0 = 0;
  for (let i = 0; i < n; i++) {
    const up = aroonUp[i], down = aroonDown[i];
    if (up !== null && down !== null) {
      const pu = aroonUp[i - 1] ?? up, pd = aroonDown[i - 1] ?? down;
      if (up > down && pu <= pd) lastAroonTrend = 1;
      else if (down > up && pd <= pu) lastAroonTrend = -1;
    }
    aroonTrend[i] = lastAroonTrend;
  }

  const aoSignal: (1 | -1 | 0)[] = new Array(n).fill(0);
  let lastAOSignal: 1 | -1 | 0 = 0;
  for (let i = 0; i < n; i++) {
    const up = aroonUp[i], down = aroonDown[i];
    if (up !== null && down !== null) {
      const osc = up - down;
      const pu = aroonUp[i - 1] ?? up, pd = aroonDown[i - 1] ?? down;
      const prevOsc = pu - pd;
      if (osc > -80 && prevOsc <= -80) lastAOSignal = 1;
      else if (osc < 80 && prevOsc >= 80) lastAOSignal = -1;
    }
    aoSignal[i] = lastAOSignal;
  }

  const { diPlus, diMinus } = calcDMI(candles, params.dmiLength);
  const dmiTrend: (1 | -1 | 0)[] = new Array(n).fill(0);
  let lastDmi: 1 | -1 | 0 = 0;
  for (let i = 0; i < n; i++) {
    const p = diPlus[i], m = diMinus[i];
    if (p !== null && m !== null) {
      const pp = diPlus[i - 1] ?? p, pm = diMinus[i - 1] ?? m;
      if (p > m && pp <= pm) lastDmi = 1;
      else if (m > p && pm <= pp) lastDmi = -1;
    }
    dmiTrend[i] = lastDmi;
  }

  const lrsi = calcLRSI(candles, params.lrsiAlpha, params.lrsiFeLength);
  const lrsiSignal: (1 | -1 | 0)[] = new Array(n).fill(0);
  let lastLrsi: 1 | -1 | 0 = 0;
  for (let i = 0; i < n; i++) {
    const v = lrsi[i];
    if (v !== null) {
      const pv = lrsi[i - 1] ?? v;
      if (v > 0.2 && pv <= 0.2) lastLrsi = 1;
      else if (v < 0.8 && pv >= 0.8) lastLrsi = -1;
    }
    lrsiSignal[i] = lastLrsi;
  }

  const trendStrength: number[] = new Array(n).fill(0);
  const entrySignals: { index: number; direction: 1 | -1 }[] = [];
  let prevStr = 0;

  for (let i = 0; i < n; i++) {
    const d = stDir[i];
    if (d === 0) { trendStrength[i] = 0; prevStr = 0; continue; }
    const ag = (t: number) => d === t ? d : 0;
    const s = ag(emaTrend[i]) + ag(aroonTrend[i]) + ag(aoSignal[i]) + ag(dmiTrend[i]) + ag(lrsiSignal[i]);
    trendStrength[i] = s;
    if (d === 1 && s >= params.threshold && prevStr < params.threshold) {
      entrySignals.push({ index: i, direction: 1 });
    } else if (d === -1 && s <= -params.threshold && prevStr > -params.threshold) {
      entrySignals.push({ index: i, direction: -1 });
    }
    prevStr = s;
  }

  return { ema20, ema50, vwap, superTrendLine: stLine, superTrendDir: stDir, rsi, trendStrength, entrySignals, aroonUp, aroonDown, diPlus, diMinus, lrsi };
}
