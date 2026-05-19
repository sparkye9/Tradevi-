/**
 * ESM6 / ES Futures Analysis API
 * Primary: TwelveData (real-time, ES1!)  →  Fallback: Yahoo Finance (ES=F, delayed)
 * Returns full bias engine, ORB calc, trade score, AI commentary, risk levels,
 * session engine, liquidity engine, regime detail, no-trade filter, market internals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calcEMA, calcRSI, calcATR, calcVWAP } from '@/lib/indicators';
import type { CandleData } from '@/lib/types';

// ─── Timezone ─────────────────────────────────────────────────────────────────

function etOffsetHours(): number {
  const now = new Date();
  const y = now.getFullYear();
  const mar1 = new Date(y, 2, 1).getDay();
  const nov1 = new Date(y, 10, 1).getDay();
  const dstStart = new Date(y, 2, mar1 === 0 ? 8 : 15 - mar1);
  const dstEnd   = new Date(y, 10, nov1 === 0 ? 1 : 8 - nov1);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

/** Unix seconds for 9:30 AM ET today (or yesterday if before RTH) */
function rthOpenTs(): number {
  const off = etOffsetHours();
  const now = new Date();
  const utcH = 9 - off;  // 9:30 ET → 13:30 UTC during EDT
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ts   = base + (utcH * 60 + 30) * 60_000;
  return ts > now.getTime()
    ? Math.floor((ts - 86_400_000) / 1000)
    : Math.floor(ts / 1000);
}

// ─── Data helpers ──────────────────────────────────────────────────────────────

function lastValid(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i]) && !Number.isNaN(arr[i])) return arr[i];
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fetch a simple Yahoo Finance quote (meta only — no candle parsing) */
async function yQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      + `?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price    = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0);
    const prev     = Number(meta.previousClose ?? price);
    const change   = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    return {
      price:     r2(price),
      open:      r2(Number(meta.regularMarketOpen ?? price)),
      high:      r2(Number(meta.regularMarketDayHigh ?? price)),
      low:       r2(Number(meta.regularMarketDayLow  ?? price)),
      prevClose: r2(prev),
      change:    r2(change),
      changePct: r2(changePct),
      volume:    Number(meta.regularMarketVolume ?? 0),
    };
  } catch { return null; }
}

/** Fetch 5-min intraday candles — TwelveData first, Yahoo fallback */
async function fetchCandles(symbol: string, tf: number): Promise<{ candles: CandleData[]; source: string }> {
  const tdKey = process.env.TWELVE_DATA_API_KEY;
  if (tdKey) {
    try {
      const off = etOffsetHours();
      const url = `https://api.twelvedata.com/time_series`
        + `?symbol=${encodeURIComponent(symbol === 'ES=F' ? 'ES1!' : symbol)}`
        + `&interval=5min&outputsize=120&prepost=1&order=ASC&apikey=${tdKey}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`TD ${res.status}`);
      const json = await res.json();
      if (json.status === 'error') throw new Error(json.message);
      const vals: { datetime: string; open: string; high: string; low: string; close: string; volume: string }[] = json.values ?? [];
      if (!vals.length) throw new Error('no values');
      const candles: CandleData[] = vals.map(v => {
        const localMs = new Date(v.datetime.replace(' ', 'T') + ':00').getTime();
        return {
          time:   Math.floor(localMs / 1000) - off * 3600,
          open:   parseFloat(v.open)   || 0,
          high:   parseFloat(v.high)   || 0,
          low:    parseFloat(v.low)    || 0,
          close:  parseFloat(v.close)  || 0,
          volume: parseFloat(v.volume) || 0,
        };
      }).filter(c => c.close > 0);
      return { candles, source: 'twelve_data' };
    } catch { /* fall through */ }
  }

  // Yahoo Finance fallback
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 8 * 3600;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${fromSec}&period2=${nowSec}&interval=5m&includePrePost=true`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo returned HTML');
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? 'No Yahoo data');
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles: CandleData[] = timestamps.map((ts, i) => ({
    time: ts, open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0,
    low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0,
  })).filter(c => c.close > 0 && c.high > 0);
  return { candles, source: 'yahoo_delayed' };
}

// ─── ORB calculation ──────────────────────────────────────────────────────────

function calcORB(candles: CandleData[], rthTs: number, tfMin: number) {
  const end = rthTs + tfMin * 60;
  const window = candles.filter(c => c.time >= rthTs - 60 && c.time < end);
  const set = window.length > 0 ? window : [
    candles.reduce((b, c) => Math.abs(c.time - rthTs) < Math.abs(b.time - rthTs) ? c : b, candles[0]),
  ];
  const high = Math.max(...set.map(c => c.high));
  const low  = Math.min(...set.map(c => c.low));
  return { high, low, count: set.length };
}

// ─── Session Engine ───────────────────────────────────────────────────────────

type SessionId = 'asia' | 'london' | 'ny_premarket' | 'ny_open' | 'lunch' | 'ny_pm' | 'power_hour' | 'after_hours' | 'overnight';

interface SessionDef {
  id: SessionId;
  label: string;
  emoji: string;
  shouldAvoid: boolean;
  avoidReason: string | null;
  color: 'emerald' | 'blue' | 'amber' | 'red' | 'gray' | 'purple';
}

function getSessionInfo(etMinutes: number): SessionDef {
  if (etMinutes >= 570 && etMinutes < 720)  return { id: 'ny_open',     label: 'NY Open',           emoji: '🔥', shouldAvoid: false, avoidReason: null, color: 'emerald' };
  if (etMinutes >= 900 && etMinutes < 960)  return { id: 'power_hour',  label: 'Power Hour',         emoji: '⚡', shouldAvoid: false, avoidReason: null, color: 'emerald' };
  if (etMinutes >= 840 && etMinutes < 900)  return { id: 'ny_pm',       label: 'NY Afternoon',       emoji: '📊', shouldAvoid: false, avoidReason: null, color: 'blue' };
  if (etMinutes >= 720 && etMinutes < 840)  return { id: 'lunch',       label: 'Lunch — Chop Zone',  emoji: '⚠️', shouldAvoid: true,  avoidReason: 'Lunch hour — low liquidity, choppy price action, no institutional flow', color: 'amber' };
  if (etMinutes >= 960 && etMinutes < 1200) return { id: 'after_hours', label: 'After Hours',        emoji: '🌆', shouldAvoid: true,  avoidReason: 'After market close — thin liquidity, wide spreads, no reliable direction', color: 'gray' };
  if (etMinutes >= 240 && etMinutes < 570)  return { id: 'ny_premarket',label: 'Pre-Market',         emoji: '🌅', shouldAvoid: false, avoidReason: null, color: 'blue' };
  if (etMinutes >= 120 && etMinutes < 240)  return { id: 'london',      label: 'London Session',     emoji: '🌍', shouldAvoid: false, avoidReason: null, color: 'blue' };
  if (etMinutes >= 1200 || etMinutes < 120) return { id: 'asia',        label: 'Asia Session',       emoji: '🌏', shouldAvoid: false, avoidReason: null, color: 'purple' };
  return { id: 'overnight', label: 'Overnight', emoji: '🌙', shouldAvoid: false, avoidReason: null, color: 'gray' };
}

function computeSession(candles: CandleData[], currentPriceVal: number, vwapVal: number, atrVal: number) {
  const off = etOffsetHours();
  const now = new Date();
  const etMs = now.getTime() + off * 3600000;
  const etDate = new Date(etMs);
  const etMinutes = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();
  const sessionDef = getSessionInfo(etMinutes);

  const sessionStartMinET: Record<SessionId, number> = {
    ny_open: 570, power_hour: 900, ny_pm: 840, lunch: 720,
    after_hours: 960, ny_premarket: 240, london: 120,
    asia: etMinutes >= 1200 ? 1200 : 0, overnight: 0,
  };
  const startMinET = sessionStartMinET[sessionDef.id];
  const todayUTCMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const sessionStartTs = todayUTCMidnight + (startMinET * 60) - (off * 3600);

  const sessionCandles = candles.filter(c => c.time >= sessionStartTs);
  const sessionHigh = sessionCandles.length > 0 ? Math.max(...sessionCandles.map(c => c.high)) : currentPriceVal;
  const sessionLow  = sessionCandles.length > 0 ? Math.min(...sessionCandles.map(c => c.low))  : currentPriceVal;
  const sessionRange = sessionHigh - sessionLow;

  const sessionEndMinET: Record<SessionId, number> = {
    ny_open: 720, power_hour: 960, ny_pm: 900, lunch: 840,
    after_hours: 1200, ny_premarket: 570, london: 240,
    asia: etMinutes >= 1200 ? 1440 + 120 : 120, overnight: 570,
  };
  const endMinET = sessionEndMinET[sessionDef.id];
  const minutesRemaining = endMinET > etMinutes ? endMinET - etMinutes : 0;

  const upCandles = sessionCandles.filter(c => c.close > c.open).length;
  const consistency = sessionCandles.length > 4 ? Math.abs(upCandles / sessionCandles.length - 0.5) * 2 : 0;

  let character: 'trending' | 'ranging' | 'chop' | 'expansion' | 'compressing';
  let badge: string;
  if (sessionRange > atrVal * 2.5)                        { character = 'expansion';   badge = 'EXPANSION'; }
  else if (consistency > 0.5 && sessionRange > atrVal)    { character = 'trending';    badge = 'TRENDING'; }
  else if (sessionRange < atrVal * 0.5)                   { character = 'compressing'; badge = 'COMPRESSION'; }
  else if (sessionDef.shouldAvoid)                         { character = 'chop';        badge = 'CHOP'; }
  else                                                     { character = 'ranging';     badge = 'RANGING'; }

  const priceVsSessionVwap: 'above' | 'below' = currentPriceVal >= (sessionHigh + sessionLow) / 2 ? 'above' : 'below';

  return {
    ...sessionDef,
    etMinutes,
    minutesRemaining,
    sessionHigh: r2(sessionHigh),
    sessionLow:  r2(sessionLow),
    sessionRange: r2(sessionRange),
    character,
    badge,
    priceVsSessionVwap,
    candleCount: sessionCandles.length,
  };
}

// ─── Liquidity Engine ─────────────────────────────────────────────────────────

function computeLiquidity(candles: CandleData[], currentPriceVal: number) {
  const off = etOffsetHours();
  const now = new Date();
  const todayUTCMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;

  // Overnight: from yesterday 4PM ET to today 9:30AM ET
  const prevClose4PM = todayUTCMidnight + (16 * 3600) - (off * 3600) - 86400;
  const todayRTH     = todayUTCMidnight + (9 * 3600 + 30 * 60) - (off * 3600);
  const overnightCandles = candles.filter(c => c.time >= prevClose4PM && c.time < todayRTH);

  const overnightHigh = overnightCandles.length > 0 ? Math.max(...overnightCandles.map(c => c.high)) : 0;
  const overnightLow  = overnightCandles.length > 0 ? Math.min(...overnightCandles.map(c => c.low)) : 0;

  // Asia: 8PM-4AM ET previous night
  const asiaStart = todayUTCMidnight + (20 * 3600) - (off * 3600) - 86400;
  const asiaEnd   = todayUTCMidnight + (4  * 3600) - (off * 3600);
  const asiaCandles = candles.filter(c => c.time >= asiaStart && c.time < asiaEnd);
  const asiaHigh = asiaCandles.length > 0 ? Math.max(...asiaCandles.map(c => c.high)) : null;
  const asiaLow  = asiaCandles.length > 0 ? Math.min(...asiaCandles.map(c => c.low))  : null;

  // London: 2AM-8AM ET
  const londonStart = todayUTCMidnight + (2 * 3600) - (off * 3600);
  const londonEnd   = todayUTCMidnight + (8 * 3600) - (off * 3600);
  const londonCandles = candles.filter(c => c.time >= londonStart && c.time < londonEnd);
  const londonHigh = londonCandles.length > 0 ? Math.max(...londonCandles.map(c => c.high)) : null;
  const londonLow  = londonCandles.length > 0 ? Math.min(...londonCandles.map(c => c.low))  : null;

  type SweepStatus = 'reclaimed' | 'rejected' | 'unresolved';
  interface Sweep {
    label: string; level: number; direction: 'up' | 'down';
    status: SweepStatus; sweepTime: string;
  }
  const sweeps: Sweep[] = [];
  const levels = [
    { label: 'Overnight High', level: overnightHigh },
    { label: 'Overnight Low',  level: overnightLow  },
    ...(asiaHigh ? [{ label: 'Asia High', level: asiaHigh }] : []),
    ...(asiaLow  ? [{ label: 'Asia Low',  level: asiaLow  }] : []),
    ...(londonHigh ? [{ label: 'London High', level: londonHigh }] : []),
    ...(londonLow  ? [{ label: 'London Low',  level: londonLow  }] : []),
  ].filter(l => l.level > 0);

  const recent = candles.slice(-30);
  for (const { label, level } of levels) {
    for (const c of recent) {
      if (c.high > level * 1.0005 && c.close < level) {
        const status: SweepStatus = currentPriceVal < level * 0.999 ? 'rejected' : currentPriceVal > level ? 'reclaimed' : 'unresolved';
        sweeps.push({ label, level: r2(level), direction: 'up', status, sweepTime: new Date(c.time * 1000).toISOString().slice(11, 16) });
        break;
      }
      if (c.low < level * 0.9995 && c.close > level) {
        const status: SweepStatus = currentPriceVal > level * 1.001 ? 'reclaimed' : currentPriceVal < level ? 'rejected' : 'unresolved';
        sweeps.push({ label, level: r2(level), direction: 'down', status, sweepTime: new Date(c.time * 1000).toISOString().slice(11, 16) });
        break;
      }
    }
  }

  const sortedLevels = levels.filter(l => l.level > 0).sort((a, b) => Math.abs(a.level - currentPriceVal) - Math.abs(b.level - currentPriceVal));
  const nearest = sortedLevels[0] ? `${sortedLevels[0].label} (${sortedLevels[0].level.toFixed(0)})` : null;

  return {
    overnightHigh: r2(overnightHigh),
    overnightLow:  r2(overnightLow),
    asiaHigh:      asiaHigh   ? r2(asiaHigh)   : null,
    asiaLow:       asiaLow    ? r2(asiaLow)    : null,
    londonHigh:    londonHigh ? r2(londonHigh) : null,
    londonLow:     londonLow  ? r2(londonLow)  : null,
    sweeps,
    nearestLevel: nearest,
  };
}

// ─── Enhanced Regime ──────────────────────────────────────────────────────────

function classifyRegimeEnhanced(candles: CandleData[], atr: number, vwap: number, biasScore: number, isChop: boolean) {
  if (candles.length < 10) return {
    type: 'unknown', label: 'Analyzing…', color: 'gray',
    approach: 'Not enough data yet.', avoid: 'All trades', badges: ['LOADING'],
  };

  const last20 = candles.slice(-20);
  const last5  = candles.slice(-5);
  const N = last20.length;
  const firstClose = last20[0].close;
  const lastClose  = last20[N - 1].close;
  const netMove    = (lastClose - firstClose) / Math.max(atr, 1);
  const upCount    = last20.filter(c => c.close > c.open).length;
  const consistency = Math.abs(upCount / N - 0.5) * 2;
  const last5ATR   = last5.reduce((s, c) => s + (c.high - c.low), 0) / 5;
  const atrRatio   = atr > 0 ? last5ATR / atr : 1;
  const rangeAvg   = last20.reduce((s, c) => s + (c.high - c.low), 0) / N;

  if (atrRatio > 2.5) {
    return {
      type: biasScore > 50 ? 'expansion_up' : 'expansion_down',
      label: 'Expansion Day', color: 'amber',
      approach: 'Ride momentum. Use wider stops. Let winners run.',
      avoid: 'Countertrend fades until exhaustion signals appear',
      badges: ['EXPANSION', 'HIGH VOLATILITY'],
    };
  }
  if (isChop || (Math.abs(netMove) < 0.8 && rangeAvg < atr * 0.7)) {
    return {
      type: 'compression', label: 'Compression / Squeeze', color: 'amber',
      approach: 'Wait for breakout with volume. No trades during squeeze.',
      avoid: 'ALL TRADES until breakout confirmed',
      badges: ['COMPRESSION', 'LOW EDGE'],
    };
  }
  if (Math.abs(netMove) > 2.5 && consistency > 0.5) {
    const dir = netMove > 0 ? 'up' : 'down';
    return {
      type: dir === 'up' ? 'trend_up' : 'trend_down',
      label: dir === 'up' ? 'Trend Day ↑' : 'Trend Day ↓',
      color: 'emerald',
      approach: `Pullback entries in trend direction only. Wait for 3-5 candle retracement to EMA9/VWAP.`,
      avoid: 'Countertrend trades, chasing breakouts already extended',
      badges: ['TRENDING', dir === 'up' ? 'BULL' : 'BEAR'],
    };
  }
  if (Math.abs(netMove) < 1.5 && rangeAvg >= atr * 0.7) {
    return {
      type: 'range', label: 'Range Day', color: 'blue',
      approach: 'Fade extremes. Buy near session/ORB support. Sell near resistance. Short trades only.',
      avoid: 'Breakout chasing, trend-following',
      badges: ['RANGE', 'MEAN REVERSION'],
    };
  }
  return {
    type: 'balanced', label: 'Balanced / Developing', color: 'gray',
    approach: 'Wait for regime to clarify. No forced trades.',
    avoid: 'Premature directional bets',
    badges: ['DEVELOPING'],
  };
}

// ─── No-Trade Filter ─────────────────────────────────────────────────────────

function computeNoTradeFilter(params: {
  atr: number; isChop: boolean; sessionShouldAvoid: boolean; sessionLabel: string;
  rsi: number | null; volRatio: number; biasScore: number; ema9: number | null; ema21: number | null;
}) {
  const reasons: string[] = [];
  let score = 0;

  if (params.sessionShouldAvoid)                          { reasons.push(params.sessionLabel); score += 30; }
  if (params.isChop)                                      { reasons.push('Choppy price action — no institutional flow'); score += 25; }
  if (params.atr < 15)                                    { reasons.push(`ATR ${params.atr.toFixed(1)} pts — insufficient range (need >15 pts)`); score += 20; }
  if (params.volRatio < 0.5)                              { reasons.push(`Volume at ${(params.volRatio * 100).toFixed(0)}% of average — no conviction`); score += 15; }
  if (params.biasScore >= 43 && params.biasScore <= 57)  { reasons.push(`Bias score ${params.biasScore}/100 — no directional edge`); score += 15; }
  if (params.rsi != null && params.rsi > 78)             { reasons.push(`RSI ${params.rsi.toFixed(0)} — overbought, reversal risk`); score += 10; }
  if (params.rsi != null && params.rsi < 22)             { reasons.push(`RSI ${params.rsi.toFixed(0)} — oversold, reversal risk`); score += 10; }
  if (params.ema9 != null && params.ema21 != null && Math.abs(params.ema9 - params.ema21) < params.atr * 0.15) {
    reasons.push('EMA9/21 compression — momentum absent'); score += 10;
  }

  return { active: score >= 35, score: Math.min(100, score), reasons };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tfMin = Math.min(30, Math.max(1, parseInt(sp.get('timeframe') ?? '5', 10)));

  try {
    // Parallel fetch: quotes + candles
    const [esQ, nqQ, vixQ, spyQ, dxyQ, tnxQ, aaplQ, candleData] = await Promise.all([
      yQuote('ES=F'),
      yQuote('NQ=F'),
      yQuote('^VIX'),
      yQuote('SPY'),
      yQuote('DX-Y.NYB'),
      yQuote('^TNX'),
      yQuote('AAPL'),
      fetchCandles('ES=F', tfMin),
    ]);

    const { candles, source: dataSource } = candleData;
    if (candles.length < 5) throw new Error('Insufficient ES candle data — market may be closed');

    const currentPrice = esQ?.price ?? candles[candles.length - 1].close;
    const closes = candles.map(c => c.close);

    // Indicators
    const ema9   = lastValid(calcEMA(closes, 9));
    const ema21  = lastValid(calcEMA(closes, 21));
    const ema50  = lastValid(calcEMA(closes, 50));
    const rsi    = lastValid(calcRSI(closes, 14));
    const atr    = calcATR(candles, 14);
    const vwap   = calcVWAP(candles);

    // ORB
    const rthTs = rthOpenTs();
    const { high: orbHigh, low: orbLow } = calcORB(candles, rthTs, tfMin);
    const orbMid   = (orbHigh + orbLow) / 2;
    const orbRange = orbHigh - orbLow;
    const orbStatus: 'above' | 'below' | 'inside' =
      currentPrice > orbHigh ? 'above' : currentPrice < orbLow ? 'below' : 'inside';

    // Volume ratio (current vs session average)
    const avgVol = candles.length > 0
      ? candles.reduce((s, c) => s + c.volume, 0) / candles.length : 1;
    const latestVol = candles[candles.length - 1].volume;
    const volRatio = avgVol > 0 ? latestVol / avgVol : 1;

    const vixChg = vixQ?.changePct ?? 0;

    // ─── Bias engine (100pt total) ─────────────────────────────────────────
    const vwapPts   = currentPrice > vwap   ? 20 : currentPrice < vwap   ? 0  : 10;
    const emaPts    = (ema9 != null && ema21 != null)
      ? (currentPrice > ema9 && ema9 > ema21 ? 20 : currentPrice < ema9 && ema9 < ema21 ? 0 : 10)
      : 10;
    const rsiPts    = rsi != null ? (rsi > 55 ? 15 : rsi < 45 ? 0 : 7) : 7;
    const orbPts    = orbStatus === 'above' ? 20 : orbStatus === 'below' ? 0 : 10;
    const volPts    = volRatio > 1.2 ? 10 : volRatio < 0.7 ? 3 : 6;
    const vixPts    = vixChg < -2 ? 15 : vixChg > 2 ? 0 : 7;
    const biasScore = Math.round(vwapPts + emaPts + rsiPts + orbPts + volPts + vixPts);
    const bias: 'bullish' | 'bearish' | 'neutral' =
      biasScore >= 62 ? 'bullish' : biasScore <= 38 ? 'bearish' : 'neutral';

    const biasFactors = [
      { label: 'VWAP',       signal: vwapPts > 10 ? 'bullish' : vwapPts < 10 ? 'bearish' : 'neutral' as const, detail: `${currentPrice > vwap ? 'Above' : 'Below'} ${vwap.toFixed(0)}`, pts: vwapPts },
      { label: 'EMA Trend',  signal: emaPts  > 10 ? 'bullish' : emaPts  < 10 ? 'bearish' : 'neutral' as const, detail: ema9 != null ? `EMA9 ${ema9.toFixed(0)}` : '—', pts: emaPts },
      { label: 'RSI',        signal: rsiPts  > 7  ? 'bullish' : rsiPts  < 7  ? 'bearish' : 'neutral' as const, detail: rsi != null ? rsi.toFixed(1) : '—', pts: rsiPts },
      { label: 'ORB Status', signal: orbPts  > 10 ? 'bullish' : orbPts  < 10 ? 'bearish' : 'neutral' as const, detail: orbStatus === 'above' ? 'Above High' : orbStatus === 'below' ? 'Below Low' : 'Inside', pts: orbPts },
      { label: 'Volume',     signal: volPts  > 6  ? 'bullish' : 'neutral' as const, detail: `${volRatio.toFixed(1)}x avg`, pts: volPts },
      { label: 'VIX',        signal: vixPts  > 7  ? 'bullish' : vixPts  < 7  ? 'bearish' : 'neutral' as const, detail: `${vixQ?.price?.toFixed(1) ?? '—'} (${vixChg > 0 ? '+' : ''}${vixChg.toFixed(1)}%)`, pts: vixPts },
    ];

    // ─── Chop detection ────────────────────────────────────────────────────
    const recentCandles = candles.slice(-20);
    const avgRange = recentCandles.reduce((s, c) => s + (c.high - c.low), 0) / recentCandles.length;
    const isLowATR  = atr < avgRange * 0.6;
    const isInside  = orbStatus === 'inside';
    const isNeutRSI = rsi != null && rsi > 44 && rsi < 56;
    const isLowVol  = volRatio < 0.75;
    const isChop    = isLowATR || (isInside && isNeutRSI && isLowVol);
    const chopReasons: string[] = [];
    if (isLowATR)               chopReasons.push('Low ATR — range contraction, no momentum');
    if (isInside)               chopReasons.push(`Price inside ORB (${orbLow.toFixed(0)}–${orbHigh.toFixed(0)}) — no directional conviction`);
    if (isNeutRSI && isLowVol)  chopReasons.push('RSI neutral + below-average volume');

    // ─── Trade quality score ───────────────────────────────────────────────
    let score = 0;
    if (bias !== 'neutral' && orbStatus !== 'inside')                  score += 25;
    else if (bias !== 'neutral' || orbStatus !== 'inside')             score += 12;
    if (orbStatus !== 'inside')                                        score += 20;
    if (rsi != null && rsi > 40 && rsi < 70)                          score += 15;
    if (volRatio > 1.0)                                                score += 15;
    if (ema9 != null && ema21 != null)                                 score += 10;
    if (!isChop)                                                       score += 15;
    if (rsi != null && (rsi > 75 || rsi < 25))                        score -= 10;
    if (isChop) score = Math.min(score, 40);
    if (orbStatus === 'inside' && bias === 'neutral')                  score = Math.min(score, 30);
    const tradeScore = Math.max(0, Math.min(100, Math.round(score)));

    const tradeGrade =
      isChop         ? 'CHOP'  :
      tradeScore >= 85 ? 'A+'  :
      tradeScore >= 70 ? 'A'   :
      tradeScore >= 55 ? 'B'   :
      tradeScore >= 40 ? 'C'   : 'AVOID';

    const gradeLabel =
      tradeGrade === 'A+' ? 'Strong Setup — High Probability' :
      tradeGrade === 'A'  ? 'Good Setup — Trade with Discipline' :
      tradeGrade === 'B'  ? 'Moderate Setup — Smaller Size' :
      tradeGrade === 'C'  ? 'Weak Setup — Caution' :
      tradeGrade === 'CHOP' ? 'Low Edge — Avoid Trading' : 'Avoid — No Clear Edge';

    const regime =
      isChop          ? 'ranging'      :
      biasScore >= 70 ? 'trending_up'  :
      biasScore <= 30 ? 'trending_down': 'volatile';

    // ─── New engines ──────────────────────────────────────────────────────
    const sessionData    = computeSession(candles, currentPrice, vwap, atr);
    const liquidityData  = computeLiquidity(candles, currentPrice);
    const regimeDetailData = classifyRegimeEnhanced(candles, atr, vwap, biasScore, isChop);
    const noTradeData    = computeNoTradeFilter({
      atr, isChop,
      sessionShouldAvoid: sessionData.shouldAvoid,
      sessionLabel: sessionData.label,
      rsi, volRatio, biasScore,
      ema9, ema21,
    });

    // ─── Risk levels (ATR-based, in points) ────────────────────────────────
    const stopPts = Math.max(5, Math.round(atr * 0.75));
    const t1Pts   = Math.round(stopPts * 1.5);
    const t2Pts   = stopPts * 2;
    const t3Pts   = stopPts * 3;
    const dir     = bias === 'bearish' ? -1 : 1;

    // ─── AI Commentary (rule-based, calm & professional) ───────────────────
    const p = currentPrice.toFixed(0);
    const v = vwap.toFixed(0);
    const r = rsi?.toFixed(0) ?? '—';
    const sessionCtx = `${sessionData.label} · ${sessionData.badge} · ${sessionData.minutesRemaining}min remaining`;
    let aiSummary = '', aiEntry = '', aiInvalidation = '', aiTargets = '';
    const aiWarnings: string[] = [];

    if (sessionData.shouldAvoid) {
      aiWarnings.push(sessionData.avoidReason ?? `${sessionData.label} — avoid trading this session`);
    }

    if (isChop) {
      aiSummary     = `[${sessionCtx}] ES is in a low-volatility range (ORB: ${orbLow.toFixed(0)}–${orbHigh.toFixed(0)}). ATR is compressed and RSI at ${r} shows no directional edge. Patience is the trade right now.`;
      aiEntry       = 'Stand aside. Wait for a volume-confirmed break of the ORB with RSI > 55 (long) or < 45 (short).';
      aiInvalidation= 'If the ORB range holds past 11 AM ET with no expansion, avoid the session entirely.';
      aiTargets     = 'No trade — no target.';
      aiWarnings.push('Low-edge environment. Trading chop causes emotional mistakes and unnecessary losses.');
    } else if (bias === 'bullish' && orbStatus === 'above') {
      aiSummary     = `[${sessionCtx}] ES (${p}) has broken above the ${tfMin}m ORB high (${orbHigh.toFixed(0)}) and is above VWAP (${v}). RSI ${r} confirms momentum is intact. Conditions favor long continuation.`;
      aiEntry       = `Best entry: pullback to ORB high (${orbHigh.toFixed(0)}) or VWAP (${v}). Do NOT chase. Wait for price to come to you.`;
      aiInvalidation= `A close below ${orbMid.toFixed(0)} (ORB midpoint) invalidates the bullish read. Exit if that level breaks.`;
      aiTargets     = `T1: ${(currentPrice + t1Pts).toFixed(0)} (+${t1Pts}pts · $${t1Pts * 5} MES), T2: ${(currentPrice + t2Pts).toFixed(0)} (+${t2Pts}pts), T3: ${(currentPrice + t3Pts).toFixed(0)} (+${t3Pts}pts).`;
      if (rsi != null && rsi > 72) aiWarnings.push(`RSI at ${r} is extended — wait for a pullback before entering long.`);
      if (regimeDetailData.type === 'trend_up') aiWarnings.push('Trend Day environment — pullback entries preferred, avoid chasing.');
    } else if (bias === 'bearish' && orbStatus === 'below') {
      aiSummary     = `[${sessionCtx}] ES (${p}) has broken below the ${tfMin}m ORB low (${orbLow.toFixed(0)}) and is below VWAP (${v}). RSI ${r} confirms bearish momentum. Conditions favor short continuation.`;
      aiEntry       = `Best entry: rally to ORB low (${orbLow.toFixed(0)}) or VWAP (${v}) for a low-risk short. Do NOT chase the move already in progress.`;
      aiInvalidation= `A close above ${orbMid.toFixed(0)} (ORB midpoint) invalidates the bearish read. Cut losses.`;
      aiTargets     = `T1: ${(currentPrice - t1Pts).toFixed(0)} (-${t1Pts}pts · $${t1Pts * 5} MES), T2: ${(currentPrice - t2Pts).toFixed(0)} (-${t2Pts}pts), T3: ${(currentPrice - t3Pts).toFixed(0)} (-${t3Pts}pts).`;
      if (rsi != null && rsi < 28) aiWarnings.push(`RSI at ${r} is oversold — expect a short-term bounce before continuation.`);
      if (regimeDetailData.type === 'trend_down') aiWarnings.push('Trend Day environment — pullback entries preferred, avoid chasing.');
    } else {
      aiSummary     = `[${sessionCtx}] ES (${p}) is ${orbStatus === 'inside' ? 'inside the ORB range' : `${orbStatus} the ORB`} with mixed signals. No clear high-probability setup yet. Bias: ${bias}.`;
      aiEntry       = regimeDetailData.type === 'range'
        ? 'Range Day — fade extremes. Buy at session low, sell at session high. No breakout chasing.'
        : 'Wait for the ORB to be clearly broken in one direction with volume and bias alignment.';
      aiInvalidation= 'Both ORB boundaries are active levels. No position until direction is confirmed.';
      aiTargets     = 'Define after directional confirmation.';
      aiWarnings.push('Mixed signals — reduce size to minimum if you trade.');
    }

    if (vixQ && vixQ.changePct > 5) aiWarnings.push(`VIX spiking +${vixQ.changePct.toFixed(1)}% — widen stops, reduce size.`);
    if (vixQ && vixQ.price > 25)    aiWarnings.push(`VIX above 25 (${vixQ.price.toFixed(1)}) — elevated fear, increased whipsaws.`);

    if (liquidityData.nearestLevel) {
      aiWarnings.push(`Nearest liquidity level: ${liquidityData.nearestLevel} — watch for reaction.`);
    }

    // ─── Return ────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,

      es:  esQ  ?? { price: currentPrice, change: 0, changePct: 0 },
      nq:  nqQ  ?? null,
      vix: vixQ ?? null,
      spy: spyQ ?? null,
      esPrice: r2(currentPrice),
      contractNote: 'MES = $5/pt · ES = $50/pt · same index price',

      orb: {
        high: r2(orbHigh), low: r2(orbLow), mid: r2(orbMid), range: r2(orbRange),
        timeframe: tfMin, status: orbStatus,
        t1Up: r2(orbHigh + orbRange * 0.5),  t2Up: r2(orbHigh + orbRange),   t3Up: r2(orbHigh + orbRange * 2),
        t1Dn: r2(orbLow  - orbRange * 0.5),  t2Dn: r2(orbLow  - orbRange),   t3Dn: r2(orbLow  - orbRange * 2),
      },

      vwap: r2(vwap), ema9: ema9 != null ? r2(ema9) : null,
      ema21: ema21 != null ? r2(ema21) : null, ema50: ema50 != null ? r2(ema50) : null,
      rsi: rsi != null ? r2(rsi) : null, atr: r2(atr),

      bias, biasScore, biasFactors,
      tradeScore, tradeGrade, gradeLabel, isChop, chopReasons, regime,

      // New fields
      regimeDetail: regimeDetailData,
      session: sessionData,
      liquidity: liquidityData,
      noTrade: noTradeData,

      internals: {
        dxy:  dxyQ  ? { price: dxyQ.price,  changePct: dxyQ.changePct,  interpretation: dxyQ.changePct  > 0.3 ? 'Rising DXY → headwind for ES' : dxyQ.changePct < -0.3 ? 'Falling DXY → tailwind for ES' : 'DXY neutral' } : null,
        tnx:  tnxQ  ? { price: tnxQ.price,  changePct: tnxQ.changePct,  interpretation: tnxQ.changePct  > 2   ? 'Rising yields → ES pressure' : tnxQ.changePct < -2 ? 'Falling yields → ES tailwind' : 'Yields stable' } : null,
        aapl: aaplQ ? { price: aaplQ.price, changePct: aaplQ.changePct, interpretation: aaplQ.changePct > 1.5 ? 'AAPL leading → bullish ES' : aaplQ.changePct < -1.5 ? 'AAPL weak → ES pressure' : 'AAPL neutral' } : null,
      },

      risk: {
        stopPts,  t1Pts,  t2Pts,  t3Pts,
        stopDir:  r2(currentPrice - dir * stopPts),
        t1:       r2(currentPrice + dir * t1Pts),
        t2:       r2(currentPrice + dir * t2Pts),
        t3:       r2(currentPrice + dir * t3Pts),
        mesPerStop: stopPts * 5,
        rr1: `1:${(t1Pts / stopPts).toFixed(1)}`,
        rr2: `1:${(t2Pts / stopPts).toFixed(1)}`,
      },

      aiSummary, aiEntry, aiInvalidation, aiTargets, aiWarnings,

      candles: candles.slice(-80),
      dataSource,
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'ES data unavailable',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
