/**
 * Power Hour Prediction Engine API
 * Multi-timeframe trend analysis, pattern detection, catalyst filter,
 * dump/buy windows, options scalp planner, order plan, and final decision box.
 * Supports SPY, QQQ, ES=F and any symbol via ?symbol=
 */

import { NextRequest, NextResponse } from 'next/server';
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

// ─── Candle parsing helper ────────────────────────────────────────────────────

function parseCandles(json: unknown): CandleData[] {
  const j = json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> } }> } };
  const result = j?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  return timestamps.map((ts, i) => ({
    time:   ts,
    open:   q.open?.[i]   ?? 0,
    high:   q.high?.[i]   ?? 0,
    low:    q.low?.[i]    ?? 0,
    close:  q.close?.[i]  ?? 0,
    volume: q.volume?.[i] ?? 0,
  })).filter(c => c.close > 0 && c.high > 0);
}

// ─── Yahoo fetch helpers ──────────────────────────────────────────────────────

async function fetchYFCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return parseCandles(json);
  } catch { return []; }
}

async function fetchYFQuote(symbol: string): Promise<{ price: number; prevClose: number; change: number; changePct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price     = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    const change    = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { price: r2(price), prevClose: r2(prevClose), change: r2(change), changePct: r2(changePct) };
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

// ─── Aggregate 1H → 4H candles ────────────────────────────────────────────────

function aggregate4H(hourly: CandleData[]): CandleData[] {
  const out: CandleData[] = [];
  for (let i = 0; i + 3 < hourly.length; i += 4) {
    const block = hourly.slice(i, i + 4);
    out.push({
      time:   block[0].time,
      open:   block[0].open,
      high:   Math.max(...block.map(c => c.high)),
      low:    Math.min(...block.map(c => c.low)),
      close:  block[block.length - 1].close,
      volume: block.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// ─── Timeframe analysis ───────────────────────────────────────────────────────

interface TFResult {
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi: number | null;
  vwap: number | null;
}

function analyzeTF(label: string, candles: CandleData[], useVWAP = false): TFResult {
  if (candles.length < 10) {
    return { label, bias: 'neutral', score: 50, ema9: null, ema21: null, ema50: null, rsi: null, vwap: null };
  }
  const closes  = candles.map(c => c.close);
  const price   = closes[closes.length - 1];
  const ema9    = lastValid(calcEMA(closes, 9));
  const ema21   = lastValid(calcEMA(closes, Math.min(21, closes.length)));
  const ema50   = lastValid(calcEMA(closes, Math.min(50, closes.length)));
  const rsi     = lastValid(calcRSI(closes, 14));
  const vwap    = useVWAP ? calcVWAP(candles) : null;

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
    ema50: ema50 != null ? r2(ema50) : null,
    rsi:   rsi   != null ? r2(rsi)   : null,
    vwap:  vwap  != null ? r2(vwap)  : null,
  };
}

// ─── Pattern types ────────────────────────────────────────────────────────────

interface Pattern {
  name: string;
  detected: boolean;
  confidence: number;
  confirms: string[];
  invalidates: string[];
  bestWindow: string;
  confidenceScore: number;
}

// ─── Pattern detection ────────────────────────────────────────────────────────

function detectPatterns(todayCandles: CandleData[], vwap: number, rsi: number | null, atr: number): Pattern[] {
  const n = todayCandles.length;
  const price = n > 0 ? todayCandles[n - 1].close : 0;

  // ── 1. Bull Flag ──────────────────────────────────────────────────────────
  const bullFlagDetected = (() => {
    if (n < 14) return false;
    const run = todayCandles.slice(-14, -4);
    const flag = todayCandles.slice(-4);
    const runMove = (run[run.length - 1].close - run[0].close) / run[0].close * 100;
    const flagRange = (Math.max(...flag.map(c => c.high)) - Math.min(...flag.map(c => c.low))) / price * 100;
    return runMove > 0.4 && flagRange < 0.25 && price > vwap;
  })();
  const bullFlagConf = (() => {
    if (!bullFlagDetected) return 0;
    if (rsi != null && rsi >= 50 && rsi <= 65) return Math.min(100, 60 + rsi / 10);
    return 62;
  })();

  // ── 2. Bear Flag ──────────────────────────────────────────────────────────
  const bearFlagDetected = (() => {
    if (n < 14) return false;
    const run = todayCandles.slice(-14, -4);
    const flag = todayCandles.slice(-4);
    const runMove = (run[0].close - run[run.length - 1].close) / run[0].close * 100;
    const flagRange = (Math.max(...flag.map(c => c.high)) - Math.min(...flag.map(c => c.low))) / price * 100;
    return runMove > 0.4 && flagRange < 0.25 && price < vwap;
  })();
  const bearFlagConf = (() => {
    if (!bearFlagDetected) return 0;
    if (rsi != null && rsi >= 35 && rsi <= 50) return Math.min(100, 60 + (50 - rsi) / 10);
    return 62;
  })();

  // ── 3. Rise Then Dump ────────────────────────────────────────────────────
  const riseThenDumpDetected = (() => {
    if (n < 10) return false;
    const firstHalf  = todayCandles.slice(0, Math.floor(n / 2));
    const last5      = todayCandles.slice(-5);
    if (firstHalf.length < 3) return false;
    const rose = (Math.max(...firstHalf.map(c => c.high)) - firstHalf[0].close) / firstHalf[0].close * 100 > 0.5;
    const lowerCloses = last5.every((c, i) => i === 0 || c.close < last5[i - 1].close);
    return rose && lowerCloses;
  })();

  // ── 4. Drop Then Reclaim ──────────────────────────────────────────────────
  const dropThenReclaimDetected = (() => {
    if (n < 8) return false;
    const firstHalf = todayCandles.slice(0, Math.floor(n / 2));
    const last3     = todayCandles.slice(-3);
    if (firstHalf.length < 3) return false;
    const dropped = (firstHalf[0].close - Math.min(...firstHalf.map(c => c.low))) / firstHalf[0].close * 100 > 0.5;
    const higherCloses = last3.every((c, i) => i === 0 || c.close > last3[i - 1].close);
    const crossedVWAP  = last3[last3.length - 1].close > vwap;
    return dropped && higherCloses && crossedVWAP;
  })();
  const dropReclaimConf = dropThenReclaimDetected ? (rsi != null && rsi > 45 ? 65 : 55) : 0;

  // ── 5. Liquidity Sweep Then Reversal ──────────────────────────────────────
  const liquiditySweepDetected = (() => {
    if (n < 8) return false;
    const look  = todayCandles.slice(-6);
    const prior = todayCandles.slice(0, n - 6);
    if (prior.length < 2) return false;
    const sessionLow = Math.min(...prior.map(c => c.low));
    for (let i = 0; i < look.length - 2; i++) {
      const swept = look[i].low < sessionLow && look[i].close > look[i].low;
      if (!swept) continue;
      const laterHigher = look[i + 1].close > look[i].close && (i + 2 < look.length ? look[i + 2].close > look[i + 1].close : true);
      if (laterHigher) return true;
    }
    return false;
  })();

  // ── 6. Failed Breakout ────────────────────────────────────────────────────
  const failedBreakoutDetected = (() => {
    if (n < 10) return false;
    const prior = todayCandles.slice(0, n - 8);
    const look  = todayCandles.slice(-8);
    if (prior.length < 2) return false;
    const sessionHigh = Math.max(...prior.map(c => c.high));
    for (let i = 0; i < look.length - 1; i++) {
      if (look[i].high > sessionHigh) {
        if (look[i].close < sessionHigh || (i + 1 < look.length && look[i + 1].close < sessionHigh)) return true;
      }
    }
    return false;
  })();

  // ── 7. Failed Breakdown ───────────────────────────────────────────────────
  const failedBreakdownDetected = (() => {
    if (n < 10) return false;
    const prior = todayCandles.slice(0, n - 8);
    const look  = todayCandles.slice(-8);
    if (prior.length < 2) return false;
    const sessionLow = Math.min(...prior.map(c => c.low));
    for (let i = 0; i < look.length - 1; i++) {
      if (look[i].low < sessionLow) {
        if (look[i].close > sessionLow || (i + 1 < look.length && look[i + 1].close > sessionLow)) return true;
      }
    }
    return false;
  })();

  // ── 8. Chop / No Trade ───────────────────────────────────────────────────
  const chopDetected = (() => {
    if (n < 14) return false;
    const recent     = todayCandles.slice(-14);
    const last5      = todayCandles.slice(-5);
    const avgRange   = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
    const atrLow     = atr < avgRange * 0.5;
    const rsiNeutral = rsi != null && rsi >= 44 && rsi <= 56;
    const nearVWAP   = last5.every(c => Math.abs(c.close - vwap) / vwap < 0.002);
    return atrLow && rsiNeutral && nearVWAP;
  })();

  return [
    {
      name: 'Bull Flag Continuation',
      detected: bullFlagDetected,
      confidence: bullFlagConf,
      confirms:   ['Price consolidating above VWAP', 'Volume decreasing during flag', 'EMA9 still sloping up'],
      invalidates:['Close below VWAP', 'RSI drops below 50', 'Volume surge on down candle'],
      bestWindow: '3:00-3:25 PM ET',
      confidenceScore: bullFlagConf,
    },
    {
      name: 'Bear Flag Continuation',
      detected: bearFlagDetected,
      confidence: bearFlagConf,
      confirms:   ['Price consolidating below VWAP', 'Low-volume bounce in flag', 'EMA9 still sloping down'],
      invalidates:['Close above VWAP', 'RSI rises above 50', 'Strong volume reclaim'],
      bestWindow: '3:00-3:20 PM ET',
      confidenceScore: bearFlagConf,
    },
    {
      name: 'Rise Then Dump',
      detected: riseThenDumpDetected,
      confidence: riseThenDumpDetected ? 55 : 0,
      confirms:   ['Sequential lower closes last 5 candles', 'Price extended above VWAP earlier', 'RSI was elevated and now declining'],
      invalidates:['Reclaim of session high', 'RSI reverses above 60', 'Volume surge on green candle'],
      bestWindow: '3:05-3:35 PM ET',
      confidenceScore: riseThenDumpDetected ? 55 : 0,
    },
    {
      name: 'Drop Then Reclaim',
      detected: dropThenReclaimDetected,
      confidence: dropReclaimConf,
      confirms:   ['3 consecutive higher closes', 'Price crossed above VWAP', 'RSI above 45 and rising'],
      invalidates:['Lose VWAP again', 'RSI drops below 40', 'Volume dries up on reclaim'],
      bestWindow: '3:00-3:20 PM ET',
      confidenceScore: dropReclaimConf,
    },
    {
      name: 'Liquidity Sweep Then Reversal',
      detected: liquiditySweepDetected,
      confidence: liquiditySweepDetected ? 70 : 0,
      confirms:   ['Wick below session low but closed above', '2+ higher closes after sweep', 'Volume spike on sweep candle'],
      invalidates:['New low below sweep wick', 'Close back below session low', 'No follow-through within 3 candles'],
      bestWindow: '3:00-3:15 PM ET',
      confidenceScore: liquiditySweepDetected ? 70 : 0,
    },
    {
      name: 'Failed Breakout',
      detected: failedBreakoutDetected,
      confidence: failedBreakoutDetected ? 65 : 0,
      confirms:   ['Candle closed back below session high', 'Volume diminished on breakout attempt', 'RSI divergence at highs'],
      invalidates:['Reclaim and hold above session high', 'Strong volume follow-through', 'VWAP holds as support'],
      bestWindow: '3:00-3:25 PM ET',
      confidenceScore: failedBreakoutDetected ? 65 : 0,
    },
    {
      name: 'Failed Breakdown',
      detected: failedBreakdownDetected,
      confidence: failedBreakdownDetected ? 65 : 0,
      confirms:   ['Quick reclaim above session low', 'Bear trap — shorts squeezed', 'VWAP reclaim within 2 candles'],
      invalidates:['Break and close below session low again', 'Volume surge to downside', 'RSI stays below 40'],
      bestWindow: '3:05-3:20 PM ET',
      confidenceScore: failedBreakdownDetected ? 65 : 0,
    },
    {
      name: 'Chop / No Trade Zone',
      detected: chopDetected,
      confidence: chopDetected ? 80 : 0,
      confirms:   ['ATR below 50% of average range', 'RSI pinned 44-56 with no momentum', 'Price oscillating around VWAP'],
      invalidates:['ATR expansion above average', 'RSI breaks above 58 or below 42', 'Volume surge with directional close'],
      bestWindow: 'Avoid — wait for expansion',
      confidenceScore: chopDetected ? 80 : 0,
    },
  ];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? 'SPY').toUpperCase();

  try {
    // Companion symbols
    const companionQQQ   = symbol === 'QQQ' ? 'SPY' : 'QQQ';
    const companions     = [companionQQQ, '^VIX', 'DX-Y.NYB', '^TNX', 'NVDA', 'AAPL', 'MSFT', 'TSLA'];

    // Parallel fetch — 5 timeframes + 8 companion quotes
    const fetches = await Promise.allSettled([
      fetchYFCandles(symbol, '5m',  '2d'),    // 0
      fetchYFCandles(symbol, '15m', '5d'),    // 1
      fetchYFCandles(symbol, '1h',  '1mo'),   // 2
      fetchYFCandles(symbol, '1d',  '6mo'),   // 3
      fetchYFCandles(symbol, '1wk', '2y'),    // 4
      ...companions.map(s => fetchYFQuote(s)), // 5-12
    ]);

    function getCandles(idx: number): CandleData[] {
      const r = fetches[idx];
      return r.status === 'fulfilled' ? (r.value as CandleData[]) : [];
    }
    function getQuote(idx: number) {
      const r = fetches[idx];
      return r.status === 'fulfilled' ? (r.value as { price: number; prevClose: number; change: number; changePct: number } | null) : null;
    }

    const candles5m   = getCandles(0);
    const candles15m  = getCandles(1);
    const candles1h   = getCandles(2);
    const candlesDaily= getCandles(3);
    const candlesWeek = getCandles(4);

    const quoteQQQ    = getQuote(5);
    const quoteVIX    = getQuote(6);
    const quoteDXY    = getQuote(7);
    const quoteTNX    = getQuote(8);
    const quoteNVDA   = getQuote(9);
    const quoteAAPL   = getQuote(10);
    const quoteMSFT   = getQuote(11);
    const quoteTSLA   = getQuote(12);

    // Current price from 5m, fallback 15m
    const current5m   = candles5m.length   > 0 ? candles5m[candles5m.length - 1].close     : 0;
    const current15m  = candles15m.length  > 0 ? candles15m[candles15m.length - 1].close   : 0;
    const currentPrice = current5m > 0 ? current5m : current15m;

    if (currentPrice === 0) {
      return NextResponse.json({ success: false, error: 'No price data available — market may be closed' }, { status: 503 });
    }

    // ─── Section 1: Multi-Timeframe Trend Analysis ───────────────────────────

    // Today RTH candles for 5m
    const rthTs = rthOpenTsToday();
    const today5m = candles5m.filter(c => c.time >= rthTs);

    // 1m estimate: last 12 candles of 5m
    const tf1m  = analyzeTF('1m (est)',  candles5m.slice(-12),     false);
    const tf5m  = analyzeTF('5m',        candles5m,                true);
    const tf15m = analyzeTF('15m',       candles15m,               true);
    const tf1h  = analyzeTF('1H',        candles1h,                false);

    // 4H estimate: aggregate 1H into 4H blocks
    const candles4h = aggregate4H(candles1h);
    const tf4h  = analyzeTF('4H (est)',  candles4h,                false);

    const tfDay = analyzeTF('Daily',     candlesDaily,             false);
    const tfWk  = analyzeTF('Weekly',    candlesWeek,              false);

    const allTFs = [tf1m, tf5m, tf15m, tf1h, tf4h, tfDay, tfWk];
    const avgScore = allTFs.reduce((s, t) => s + t.score, 0) / allTFs.length;
    const overallBias: 'bullish' | 'bearish' | 'neutral' =
      avgScore >= 62 ? 'bullish' : avgScore <= 38 ? 'bearish' : 'neutral';

    // HTF agreement
    const shortBias  = [tf1m.bias, tf5m.bias, tf15m.bias].filter(b => b !== 'neutral');
    const longBias   = [tfDay.bias, tfWk.bias].filter(b => b !== 'neutral');
    const htfAgree   = shortBias.length > 0 && longBias.length > 0
      ? shortBias[0] === longBias[0] : false;

    // HTF warning
    let htfWarning: string | null = null;
    if (shortBias.length > 0 && longBias.length > 0 && shortBias[0] !== longBias[0]) {
      htfWarning = `Short-term (1m/5m) is ${shortBias[0]} but Daily/Weekly is ${longBias[0]} — counter-trend scalp risk. High caution.`;
    }

    // VWAP from today 5m candles
    const vwap5m = today5m.length > 5 ? calcVWAP(today5m) : calcVWAP(candles5m);
    const vwapPosition: 'above' | 'below' | 'at' =
      currentPrice > vwap5m * 1.0002 ? 'above' : currentPrice < vwap5m * 0.9998 ? 'below' : 'at';

    const mtf = {
      timeframes:    allTFs,
      overallBias,
      trendScore:    r2(avgScore),
      htfAgreement: htfAgree,
      htfWarning,
      vwapPosition,
      vwap:          r2(vwap5m),
    };

    // ─── Section 2: Power Hour Pattern Detection ─────────────────────────────

    const rsi5m  = tf5m.rsi;
    const atr5m  = calcATR(candles5m, 14);
    const patterns = detectPatterns(today5m, vwap5m, rsi5m, atr5m);

    const detectedPatterns = patterns.filter(p => p.detected);
    const bestPattern = detectedPatterns.sort((a, b) => b.confidenceScore - a.confidenceScore)[0] ?? null;

    // ─── Section 3: Catalyst Filter ─────────────────────────────────────────

    const vixPrice    = quoteVIX?.price   ?? 0;
    const vixChgPct   = quoteVIX?.changePct ?? 0;
    const dxyChgPct   = quoteDXY?.changePct ?? 0;
    const tnxChgPct   = quoteTNX?.changePct ?? 0;
    const nvdaChgPct  = quoteNVDA?.changePct ?? 0;
    const aaplChgPct  = quoteAAPL?.changePct ?? 0;
    const msftChgPct  = quoteMSFT?.changePct ?? 0;
    const tslaChgPct  = quoteTSLA?.changePct ?? 0;

    const vixLabel = vixPrice > 25 ? 'High Fear' : vixPrice > 20 ? 'Elevated' : vixPrice > 15 ? 'Moderate' : 'Low Fear';

    let bullishSignals = 0;
    let bearishSignals = 0;

    // DXY: rising = bearish equities
    if (dxyChgPct < -0.3)  bullishSignals++;
    else if (dxyChgPct > 0.3) bearishSignals++;

    // TNX: rising rates = headwind tech
    if (tnxChgPct < -2)    bullishSignals++;
    else if (tnxChgPct > 2)  bearishSignals++;

    // Mega-caps
    if (nvdaChgPct > 1.5)  bullishSignals++;
    else if (nvdaChgPct < -1.5) bearishSignals++;

    if (aaplChgPct > 1.5)  bullishSignals++;
    else if (aaplChgPct < -1.5) bearishSignals++;

    if (msftChgPct > 1.5)  bullishSignals++;
    else if (msftChgPct < -1.5) bearishSignals++;

    if (tslaChgPct > 1.5)  bullishSignals++;
    else if (tslaChgPct < -1.5) bearishSignals++;

    const newsRisk: 'low' | 'medium' | 'high' =
      vixPrice > 22 || (bullishSignals > 0 && bearishSignals > 0 && bullishSignals + bearishSignals >= 4) ? 'high' :
      vixPrice > 18 || bullishSignals + bearishSignals >= 2 ? 'medium' : 'low';

    const directionalPressure: 'bullish' | 'bearish' | 'mixed' =
      bullishSignals >= 4 ? 'bullish' : bearishSignals >= 4 ? 'bearish' : 'mixed';

    const powerHourImplication =
      directionalPressure === 'bullish'
        ? `${bullishSignals} of 6 catalyst signals are bullish — institutional tailwinds favor upside continuation into close. Watch for buy programs at 3:00 PM.`
        : directionalPressure === 'bearish'
        ? `${bearishSignals} of 6 catalyst signals are bearish — macro headwinds risk late-day sell programs. Be cautious holding longs into close.`
        : `Signals mixed (${bullishSignals} bull, ${bearishSignals} bear) — catalyst picture is unclear. Power hour could go either way; wait for price confirmation.`;

    const catalysts = {
      vix:   { price: r2(vixPrice), changePct: r2(vixChgPct), label: vixLabel },
      dxy:   { price: r2(quoteDXY?.price ?? 0), changePct: r2(dxyChgPct), signal: dxyChgPct > 0.3 ? 'bearish' : dxyChgPct < -0.3 ? 'bullish' : 'neutral' as const },
      tnx:   { price: r2(quoteTNX?.price ?? 0), changePct: r2(tnxChgPct), signal: tnxChgPct > 2 ? 'bearish' : tnxChgPct < -2 ? 'bullish' : 'neutral' as const },
      nvda:  { price: r2(quoteNVDA?.price ?? 0), changePct: r2(nvdaChgPct) },
      aapl:  { price: r2(quoteAAPL?.price ?? 0), changePct: r2(aaplChgPct) },
      msft:  { price: r2(quoteMSFT?.price ?? 0), changePct: r2(msftChgPct) },
      tsla:  { price: r2(quoteTSLA?.price ?? 0), changePct: r2(tslaChgPct) },
      companionLabel: companionQQQ,
      companionQuote: quoteQQQ,
      bullishSignals,
      bearishSignals,
      newsRisk,
      directionalPressure,
      powerHourImplication,
    };

    // ─── Section 4: Dump or Buy Window ──────────────────────────────────────

    const bullFlagP   = patterns.find(p => p.name === 'Bull Flag Continuation');
    const bearFlagP   = patterns.find(p => p.name === 'Bear Flag Continuation');
    const sweepP      = patterns.find(p => p.name === 'Liquidity Sweep Then Reversal');
    const chopP       = patterns.find(p => p.name === 'Chop / No Trade Zone');
    const riseDumpP   = patterns.find(p => p.name === 'Rise Then Dump');
    const failBOP     = patterns.find(p => p.name === 'Failed Breakout');
    const failBDOP    = patterns.find(p => p.name === 'Failed Breakdown');

    let scenario = '';
    let dumpWindow: string | null = null;
    let buyWindow:  string | null = null;
    let noTradeWarning: string | null = null;

    if (bullFlagP?.detected && vwapPosition !== 'below' && rsi5m != null && rsi5m >= 50 && rsi5m <= 65) {
      scenario   = 'Bull flag continuation — breakout expected in power hour. Watch for volume surge at 3:05-3:15 to initiate move.';
      buyWindow  = '3:00-3:15 PM ET';
    } else if (bearFlagP?.detected && vwapPosition === 'below' && rsi5m != null && rsi5m >= 35 && rsi5m <= 50) {
      scenario   = 'Bear flag continuation — breakdown risk in power hour. Sellers likely to press into close.';
      dumpWindow = '3:00-3:20 PM ET';
    } else if (sweepP?.detected) {
      scenario  = 'Post-sweep reversal — potential explosive move after 3:00 flush. Smart money absorbed at lows.';
      buyWindow = '3:00-3:10 PM ET';
    } else if (chopP?.detected) {
      noTradeWarning = 'Market is chopping around VWAP — no clear power hour edge. High risk of fake breakouts. Stand aside.';
      scenario = 'Chop zone — no directional edge. Avoid 0DTE scalps in this environment.';
    } else if (riseDumpP?.detected) {
      scenario   = 'Late-day distribution — institutional selling into strength. Bears regaining control.';
      dumpWindow = '3:05-3:35 PM ET';
    } else if (failBOP?.detected) {
      scenario   = 'Bull trap in place — weakness likely to accelerate into close. Failed breakout attracts aggressive shorting.';
      dumpWindow = '3:00-3:25 PM ET';
    } else if (failBDOP?.detected) {
      scenario  = 'Bear trap sprung — potential squeeze into close. Trapped shorts forced to cover.';
      buyWindow = '3:05-3:20 PM ET';
    } else {
      if (overallBias === 'bullish' && vwapPosition === 'above') {
        scenario  = `${symbol} holding above VWAP with bullish bias. Power hour likely to see continued buying if no macro shock.`;
        buyWindow = '3:00-3:20 PM ET';
      } else if (overallBias === 'bearish' && vwapPosition === 'below') {
        scenario   = `${symbol} below VWAP with bearish bias. Power hour at risk of late-day selling.`;
        dumpWindow = '3:00-3:20 PM ET';
      } else {
        scenario = `${symbol} near VWAP with mixed signals. No dominant power hour pattern. Wait for price to declare direction after 3:00 PM open.`;
      }
    }

    const signals: string[] = [];
    if (vwapPosition !== 'below') signals.push(`Price ${vwapPosition} VWAP ($${r2(vwap5m)})`);
    else signals.push(`Price below VWAP ($${r2(vwap5m)}) — bearish structure`);
    if (rsi5m != null) signals.push(`RSI at ${r2(rsi5m)} — ${rsi5m > 65 ? 'overbought zone' : rsi5m < 35 ? 'oversold zone' : rsi5m > 55 ? 'bullish momentum' : rsi5m < 45 ? 'bearish momentum' : 'neutral'}`);
    if (tf5m.ema9 != null && tf5m.ema21 != null) signals.push(`EMA9 ${tf5m.ema9 > tf5m.ema21 ? 'above' : 'below'} EMA21 — ${tf5m.ema9 > tf5m.ema21 ? 'bullish' : 'bearish'} momentum alignment`);
    signals.push(`HTF agreement: ${htfAgree ? 'Yes — strong directional confluence' : 'No — proceed with caution'}`);
    if (vixPrice > 0) signals.push(`VIX at ${r2(vixPrice)} (${vixLabel}) — ${vixPrice > 20 ? 'elevated premium, expect wider swings' : 'calm conditions, normal power hour flow'}`);

    const windows = { scenario, dumpWindow, buyWindow, noTradeWarning, signals };

    // ─── Section 5: Options Scalp Planner ───────────────────────────────────

    const saferStrike    = Math.round(currentPrice);
    const isCallBias     = overallBias === 'bullish' && !chopP?.detected && !noTradeWarning;
    const isPutBias      = overallBias === 'bearish' && !chopP?.detected && !noTradeWarning;
    const aggressiveCall = saferStrike + 1;
    const aggressivePut  = saferStrike - 1;
    const optionsBias: 'calls' | 'puts' | 'wait' =
      chopP?.detected || noTradeWarning ? 'wait' : isCallBias ? 'calls' : isPutBias ? 'puts' : 'wait';

    let zeroDteWarning: string | null = null;
    if (vixPrice > 20) {
      zeroDteWarning = 'VIX elevated — 0DTE premium is expensive and can decay rapidly. Use 1-2 DTE minimum.';
    } else if (chopP?.detected) {
      zeroDteWarning = 'No clear trend — 0DTE has high theta risk in chop. Avoid 0DTE until momentum emerges.';
    }

    const minimumConfirmation =
      optionsBias === 'calls'
        ? `Wait for 3:00 PM candle to close above VWAP ($${r2(vwap5m)}) with expanding volume. Enter calls on confirmation, not anticipation.`
        : optionsBias === 'puts'
        ? `Wait for 3:00 PM candle to close below VWAP ($${r2(vwap5m)}) with volume. Enter puts on rejection, not before.`
        : `No trade — wait for a clear directional break with volume above VWAP before entering any position.`;

    const options = {
      bias: optionsBias,
      saferStrike,
      aggressiveCallStrike: aggressiveCall,
      aggressivePutStrike:  aggressivePut,
      callWatch: `Consider watching calls near $${saferStrike} strike (safer) or $${aggressiveCall} (aggressive OTM)`,
      putWatch:  `Consider watching puts near $${saferStrike} strike (safer) or $${aggressivePut} (aggressive OTM)`,
      zeroDteWarning,
      minimumConfirmation,
    };

    // ─── Section 6: Order Plan ───────────────────────────────────────────────

    const dir = overallBias === 'bearish' ? -1 : 1;
    const stopPct  = 0.003;
    const t1Pct    = 0.004;
    const t2Pct    = 0.008;
    const stopLoss = r2(currentPrice * (1 - dir * stopPct));
    const t1Price  = r2(currentPrice * (1 + dir * t1Pct));
    const t2Price  = r2(currentPrice * (1 + dir * t2Pct));

    let entryTrigger: string;
    if (bullFlagP?.detected) {
      entryTrigger = `Break above ${r2(currentPrice * 1.001)} on 5m close with volume — bull flag breakout trigger`;
    } else if (bearFlagP?.detected) {
      entryTrigger = `Break below ${r2(currentPrice * 0.999)} on 5m close with volume — bear flag breakdown trigger`;
    } else if (overallBias === 'bullish') {
      entryTrigger = `VWAP hold + bounce above ${r2(vwap5m)} on 3:00-3:05 PM candle close`;
    } else if (overallBias === 'bearish') {
      entryTrigger = `VWAP rejection + close below ${r2(vwap5m)} on 3:00-3:05 PM candle close`;
    } else {
      entryTrigger = 'Wait for directional confirmation after 3:00 PM — no trade until clear breakout or breakdown';
    }

    const invalidationLevel = r2(currentPrice * (1 - dir * stopPct * 2));

    const orderPlan = {
      direction: chopP?.detected || !bestPattern ? null : overallBias === 'bullish' ? 'long' : overallBias === 'bearish' ? 'short' : null,
      entryTrigger,
      stopLoss,
      takeProfit1: t1Price,
      takeProfit2: t2Price,
      invalidationLevel,
      suggestedOrderType: 'Stop-Limit entry on break + OCO bracket for T1/T2',
    } as const;

    // ─── Section 9: Final Decision Box ──────────────────────────────────────

    // Confidence calculation
    const bestScore     = bestPattern?.confidenceScore ?? 0;
    const mtfAlignment  = Math.abs(avgScore - 50) * 2; // 0-100, how far from neutral
    let confidence      = bestScore > 0 ? Math.round(bestScore * 0.6 + mtfAlignment * 0.4) : Math.round(mtfAlignment * 0.5);
    if (noTradeWarning || chopP?.detected) confidence = Math.min(confidence, chopP?.detected ? 30 : 35);
    confidence = Math.max(0, Math.min(100, confidence));

    const confidenceLabel = confidence >= 65 ? 'High Confidence' : confidence >= 45 ? 'Moderate' : 'Low — Wait';

    const entryZone = buyWindow || dumpWindow
      ? `$${r2(currentPrice * 0.999)}-$${r2(currentPrice * 1.001)} near VWAP`
      : 'Wait for VWAP test or breakout confirmation';

    const likelyTarget = bestPattern?.detected
      ? `T1: $${t1Price} (+${(t1Pct * 100).toFixed(1)}%) | T2: $${t2Price} (+${(t2Pct * 100).toFixed(1)}%)`
      : 'Define after directional confirmation';

    const riskLevel: 'low' | 'medium' | 'high' =
      vixPrice > 22 || noTradeWarning ? 'high' :
      vixPrice > 17 || !bestPattern   ? 'medium' : 'low';

    const decision = {
      bias:               overallBias,
      bestSetup:          bestPattern?.name ?? 'No clear pattern',
      waitFor:            minimumConfirmation,
      entryZone,
      invalidation:       `Close ${overallBias === 'bullish' ? 'below' : 'above'} VWAP ($${r2(vwap5m)}) or loss of EMA9`,
      likelyTarget,
      suggestedOrderType: 'Stop-Limit entry on break + OCO bracket',
      riskLevel,
      confidence,
      confidenceLabel,
    };

    // ─── Return ──────────────────────────────────────────────────────────────

    return NextResponse.json({
      success:      true,
      symbol,
      currentPrice: r2(currentPrice),
      mtf,
      patterns,
      catalysts,
      windows,
      options,
      orderPlan,
      decision,
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Power hour engine error',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
