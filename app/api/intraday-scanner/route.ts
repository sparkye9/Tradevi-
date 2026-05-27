import { NextRequest, NextResponse } from 'next/server';
import { yfFetch } from '@/lib/yahoo-finance';
import { calcEMA, calcRSI, calcATR } from '@/lib/indicators';
import type { CandleData } from '@/lib/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const SQ2PI = Math.sqrt(2 * Math.PI);
const ncdf  = (x: number) => (1 + Math.sign(x) * (1 - Math.exp(-0.717 * Math.abs(x) - 0.416 * x * x))) / 2;

const YF = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com/',
};

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

interface QuoteData { price: number; change: number; changePct: number; prevClose: number; open: number; high: number; low: number; volume: number; }

async function fetchQuote(sym: string): Promise<QuoteData | null> {
  try {
    const r = await yfFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`);
    if (!r.ok) return null;
    const j = await r.json(); const m = j?.chart?.result?.[0]?.meta; if (!m) return null;
    const price = Number(m.regularMarketPrice ?? m.previousClose ?? 0);
    const prev  = Number(m.previousClose ?? price);
    const open  = Number(m.regularMarketOpen ?? price);
    return { price: r2(price), change: r2(price - prev), changePct: r2(prev > 0 ? (price - prev) / prev * 100 : 0), prevClose: r2(prev), open: r2(open), high: r2(Number(m.regularMarketDayHigh ?? price)), low: r2(Number(m.regularMarketDayLow ?? price)), volume: Number(m.regularMarketVolume ?? 0) };
  } catch { return null; }
}

async function fetchMultiQuote(symbols: string[]): Promise<Map<string, QuoteData>> {
  const out = new Map<string, QuoteData>();
  if (!symbols.length) return out;
  try {
    const str = symbols.map(s => encodeURIComponent(s)).join('%2C');
    const r = await yfFetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${str}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketChangePercent`);
    if (!r.ok) return out;
    const j = await r.json();
    for (const q of (j?.quoteResponse?.result ?? [])) {
      const price = Number(q.regularMarketPrice ?? 0), prev = Number(q.regularMarketPreviousClose ?? price), open = Number(q.regularMarketOpen ?? price);
      out.set(q.symbol, { price: r2(price), change: r2(price - prev), changePct: r2(Number(q.regularMarketChangePercent ?? 0)), prevClose: r2(prev), open: r2(open), high: r2(Number(q.regularMarketDayHigh ?? price)), low: r2(Number(q.regularMarketDayLow ?? price)), volume: Number(q.regularMarketVolume ?? 0) });
    }
  } catch { /* silent */ }
  return out;
}

async function fetchCandles(sym: string, interval: string, range: string): Promise<CandleData[]> {
  try {
    const r = await yfFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}&includePrePost=false`);
    if (!r.ok) return [];
    const j = await r.json(); const res = j?.chart?.result?.[0]; if (!res) return [];
    const ts: number[] = res.timestamp ?? []; const q = res.indicators?.quote?.[0] ?? {};
    return ts.map((t, i) => ({ time: t, open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0, low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0 })).filter(c => c.close > 0);
  } catch { return []; }
}

// ─── Options chain ─────────────────────────────────────────────────────────────

interface RawOption { contractSymbol: string; strike: number; bid: number; ask: number; lastPrice: number; volume?: number; openInterest?: number; impliedVolatility: number; inTheMoney: boolean; expiration: number; }

async function fetchOptionsAll(sym: string, maxDTE = 7): Promise<{ price: number; calls: RawOption[]; puts: RawOption[]; expirations: number[] }> {
  try {
    const r0 = await yfFetch(`https://query2.finance.yahoo.com/v7/finance/options/${sym}`);
    if (!r0.ok) return { price: 0, calls: [], puts: [], expirations: [] };
    const j0 = await r0.json(); const res = j0?.optionChain?.result?.[0]; if (!res) return { price: 0, calls: [], puts: [], expirations: [] };
    const price = Number(res.quote?.regularMarketPrice ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const allDates: number[] = (res.expirationDates ?? []).filter((d: number) => Math.floor((d - nowSec) / 86400) <= maxDTE);
    const opts0 = res.options?.[0] ?? {};
    let calls: RawOption[] = opts0.calls ?? [], puts: RawOption[] = opts0.puts ?? [];
    if (allDates.length > 1) {
      const extras = await Promise.all(allDates.slice(1, 5).map(async d => {
        try {
          const r = await yfFetch(`https://query2.finance.yahoo.com/v7/finance/options/${sym}?date=${d}`);
          if (!r.ok) return { calls: [] as RawOption[], puts: [] as RawOption[] };
          const j = await r.json(); const o = j?.optionChain?.result?.[0]?.options?.[0] ?? {};
          return { calls: (o.calls ?? []) as RawOption[], puts: (o.puts ?? []) as RawOption[] };
        } catch { return { calls: [] as RawOption[], puts: [] as RawOption[] }; }
      }));
      for (const e of extras) { calls = [...calls, ...e.calls]; puts = [...puts, ...e.puts]; }
    }
    calls = Array.from(new Map(calls.map(c => [c.contractSymbol, c])).values());
    puts  = Array.from(new Map(puts.map(c  => [c.contractSymbol, c])).values());
    return { price, calls, puts, expirations: allDates };
  } catch { return { price: 0, calls: [], puts: [], expirations: [] }; }
}

// ─── Technical helpers ─────────────────────────────────────────────────────────

function lastValid(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (isFinite(arr[i])) return arr[i]; return null;
}

interface SwingPoint { index: number; price: number; type: 'high' | 'low'; }

function detectSwings(candles: CandleData[], lb = 3): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = lb; i < candles.length - lb; i++) {
    const win = candles.slice(i - lb, i + lb + 1);
    if (win.every((c, j) => j === lb || c.high  <= candles[i].high)) out.push({ index: i, price: candles[i].high, type: 'high' });
    if (win.every((c, j) => j === lb || c.low   >= candles[i].low))  out.push({ index: i, price: candles[i].low,  type: 'low'  });
  }
  return out;
}

// ─── VWAP ─────────────────────────────────────────────────────────────────────

function calcVWAP(candles5m: CandleData[]): number {
  const now = new Date(); const etOffset = 4; // EDT = UTC-4 (adjust for EST = 5 in winter, simplified)
  const etNow = new Date(now.getTime() - etOffset * 3600 * 1000);
  const todayMidnightEt = new Date(etNow); todayMidnightEt.setHours(0, 0, 0, 0);
  const rthOpenEt  = new Date(todayMidnightEt); rthOpenEt.setHours(9, 30, 0, 0);
  const rthStartSec = Math.floor(rthOpenEt.getTime() / 1000) + etOffset * 3600;
  const today = candles5m.filter(c => c.time >= rthStartSec);
  const src = today.length >= 5 ? today : candles5m.slice(-78);
  const tpv = src.reduce((s, c) => s + ((c.high + c.low + c.close) / 3) * c.volume, 0);
  const vol = src.reduce((s, c) => s + c.volume, 0);
  return vol > 0 ? r2(tpv / vol) : 0;
}

// ─── Bias computation ──────────────────────────────────────────────────────────

export interface BiasResult { bias: 'bullish' | 'bearish' | 'neutral'; strength: number; ema9: number | null; ema21: number | null; ema50: number | null; rsi: number; atr: number; priceVsEma21: 'above' | 'below'; ema9AboveEma21: boolean; notes: string[]; }

function computeBias(candles: CandleData[]): BiasResult {
  const empty: BiasResult = { bias: 'neutral', strength: 50, ema9: null, ema21: null, ema50: null, rsi: 50, atr: 0, priceVsEma21: 'above', ema9AboveEma21: false, notes: ['Insufficient data'] };
  if (candles.length < 22) return empty;
  const closes = candles.map(c => c.close), price = closes[closes.length - 1];
  const ema9 = lastValid(calcEMA(closes, 9)), ema21 = lastValid(calcEMA(closes, 21)), ema50 = lastValid(calcEMA(closes, 50));
  const rsi = lastValid(calcRSI(closes, 14)) ?? 50, atr = calcATR(candles, 14);
  const notes: string[] = []; let b = 0, br = 0;
  const add = (bull: boolean, pts: number, msg: string) => { bull ? (b += pts) : (br += pts); notes.push(msg); };
  if (ema9  != null) add(price > ema9,  2, price > ema9  ? 'Above EMA9'  : 'Below EMA9');
  if (ema21 != null) add(price > ema21, 3, price > ema21 ? 'Above EMA21' : 'Below EMA21');
  if (ema50 != null) add(price > ema50, 3, price > ema50 ? 'Above EMA50' : 'Below EMA50');
  if (ema9 != null && ema21 != null) add(ema9 > ema21, 2, ema9 > ema21 ? 'EMA9>21 bull' : 'EMA9<21 bear');
  add(rsi > 55, 2, rsi > 70 ? `RSI ${rsi.toFixed(0)} overbought` : rsi > 55 ? `RSI ${rsi.toFixed(0)} bullish` : rsi < 30 ? `RSI ${rsi.toFixed(0)} oversold` : `RSI ${rsi.toFixed(0)} bearish`);
  const total = b + br, strength = total > 0 ? Math.round(b / total * 100) : 50;
  return { bias: strength >= 62 ? 'bullish' : strength <= 38 ? 'bearish' : 'neutral', strength, ema9: ema9 != null ? r2(ema9) : null, ema21: ema21 != null ? r2(ema21) : null, ema50: ema50 != null ? r2(ema50) : null, rsi: Math.round(rsi * 10) / 10, atr: r2(atr), priceVsEma21: (ema21 != null && price > ema21) ? 'above' : 'below', ema9AboveEma21: !!(ema9 != null && ema21 != null && ema9 > ema21), notes };
}

function aggregate(candles: CandleData[], n: number): CandleData[] {
  const out: CandleData[] = [];
  for (let i = 0; i < candles.length; i += n) {
    const chunk = candles.slice(i, i + n); if (!chunk.length) continue;
    out.push({ time: chunk[0].time, open: chunk[0].open, high: Math.max(...chunk.map(c => c.high)), low: Math.min(...chunk.map(c => c.low)), close: chunk[chunk.length - 1].close, volume: chunk.reduce((s, c) => s + c.volume, 0) });
  }
  return out;
}

// ─── FVG detection ─────────────────────────────────────────────────────────────

export interface FVGLevel { symbol: string; timeframe: string; type: 'bullish' | 'bearish'; high: number; low: number; mid: number; ageCandles: number; strength: 'strong' | 'moderate' | 'weak'; }

function detectFVGs(candles: CandleData[], symbol: string, tf: string): FVGLevel[] {
  const out: FVGLevel[] = [], cur = candles[candles.length - 1]?.close ?? 0;
  for (let i = 1; i < candles.length - 1; i++) {
    const [p, m, n] = [candles[i - 1], candles[i], candles[i + 1]];
    if (n.low > p.high && m.close > m.open) {
      const sz = n.low - p.high; if (sz / m.close < 0.001) continue;
      const filled = candles.slice(i + 2).some(c => c.low <= n.low && c.high >= p.high);
      if (!filled && Math.abs(cur - (n.low + p.high) / 2) / cur < 0.08)
        out.push({ symbol, timeframe: tf, type: 'bullish', high: r2(n.low), low: r2(p.high), mid: r2((n.low + p.high) / 2), ageCandles: candles.length - 1 - i, strength: sz / m.close > 0.008 ? 'strong' : sz / m.close > 0.003 ? 'moderate' : 'weak' });
    }
    if (n.high < p.low && m.close < m.open) {
      const sz = p.low - n.high; if (sz / m.close < 0.001) continue;
      const filled = candles.slice(i + 2).some(c => c.high >= n.high && c.low <= p.low);
      if (!filled && Math.abs(cur - (p.low + n.high) / 2) / cur < 0.08)
        out.push({ symbol, timeframe: tf, type: 'bearish', high: r2(p.low), low: r2(n.high), mid: r2((p.low + n.high) / 2), ageCandles: candles.length - 1 - i, strength: sz / m.close > 0.008 ? 'strong' : sz / m.close > 0.003 ? 'moderate' : 'weak' });
    }
  }
  return [...out.filter(f => f.type === 'bullish').slice(-3), ...out.filter(f => f.type === 'bearish').slice(-3)];
}

// ─── BOS / CHoCH ───────────────────────────────────────────────────────────────

export interface StructureEvent { event: 'BOS_UP' | 'BOS_DOWN' | 'CHoCH_UP' | 'CHoCH_DOWN'; level: number; ageCandles: number; significance: 'major' | 'minor'; description: string; timeframe: string; }

function detectStructure(candles: CandleData[], tf: string): StructureEvent[] {
  if (candles.length < 15) return [];
  const events: StructureEvent[] = [], lb = 3, swings = detectSwings(candles, lb);
  const highs = swings.filter(s => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows  = swings.filter(s => s.type === 'low').sort((a, b) => a.index - b.index);
  const last  = candles[candles.length - 1].close;
  for (const sh of [...highs].filter(h => h.index < candles.length - lb - 1).slice(-4).reverse()) {
    if (last > sh.price) {
      const age = candles.length - 1 - sh.index, prevH = highs.filter(h => h.index < sh.index).slice(-1)[0];
      const isC = prevH ? prevH.price > sh.price : false;
      events.push({ event: isC ? 'CHoCH_UP' : 'BOS_UP', level: r2(sh.price), ageCandles: age, significance: age <= 4 ? 'major' : 'minor', description: isC ? `CHoCH UP — reversed downtrend above ${r2(sh.price)}` : `BOS UP — bullish continuation above ${r2(sh.price)}`, timeframe: tf }); break;
    }
  }
  for (const sl of [...lows].filter(l => l.index < candles.length - lb - 1).slice(-4).reverse()) {
    if (last < sl.price) {
      const age = candles.length - 1 - sl.index, prevL = lows.filter(l => l.index < sl.index).slice(-1)[0];
      const isC = prevL ? prevL.price < sl.price : false;
      events.push({ event: isC ? 'CHoCH_DOWN' : 'BOS_DOWN', level: r2(sl.price), ageCandles: age, significance: age <= 4 ? 'major' : 'minor', description: isC ? `CHoCH DOWN — reversed uptrend below ${r2(sl.price)}` : `BOS DOWN — bearish continuation below ${r2(sl.price)}`, timeframe: tf }); break;
    }
  }
  return events;
}

// ─── Liquidity sweeps ─────────────────────────────────────────────────────────

export interface LiquiditySweep { type: 'bullish_sweep' | 'bearish_sweep'; level: number; ageCandles: number; timeframe: string; description: string; }

function detectLiquiditySweeps(candles: CandleData[], tf: string): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [], swings = detectSwings(candles, 3);
  const highs = swings.filter(s => s.type === 'high'), lows = swings.filter(s => s.type === 'low');
  for (let i = 5; i < candles.length - 1; i++) {
    const c = candles[i], nxt = candles[i + 1];
    const nearLow = lows.find(l => l.index < i - 2 && c.low < l.price && Math.abs(c.low - l.price) / l.price < 0.004);
    if (nearLow && nxt.close > nearLow.price) sweeps.push({ type: 'bullish_sweep', level: r2(nearLow.price), ageCandles: candles.length - 1 - i, timeframe: tf, description: `Stop hunt below ${r2(nearLow.price)} — bullish reversal signal` });
    const nearHigh = highs.find(h => h.index < i - 2 && c.high > h.price && Math.abs(c.high - h.price) / h.price < 0.004);
    if (nearHigh && nxt.close < nearHigh.price) sweeps.push({ type: 'bearish_sweep', level: r2(nearHigh.price), ageCandles: candles.length - 1 - i, timeframe: tf, description: `Stop hunt above ${r2(nearHigh.price)} — bearish reversal signal` });
  }
  return sweeps.slice(-5);
}

// ─── Volume profile ────────────────────────────────────────────────────────────

export interface VolumeProfile { poc: number; vahigh: number; valow: number; levels: { price: number; volume: number; pct: number }[]; }

function computeVolumeProfile(candles: CandleData[]): VolumeProfile {
  if (!candles.length) return { poc: 0, vahigh: 0, valow: 0, levels: [] };
  const prices = candles.map(c => (c.high + c.low + c.close) / 3);
  const minP = Math.min(...prices) * 0.9995, maxP = Math.max(...prices) * 1.0005;
  const N = 24, bSz = (maxP - minP) / N, buckets = new Array(N).fill(0);
  prices.forEach((p, i) => { const idx = Math.min(N - 1, Math.floor((p - minP) / bSz)); buckets[idx] += candles[i].volume; });
  const totalVol = buckets.reduce((a, b) => a + b, 0);
  const pocIdx = buckets.indexOf(Math.max(...buckets));
  let vaVol = buckets[pocIdx], lo = pocIdx, hi = pocIdx;
  while (vaVol < totalVol * 0.7 && (lo > 0 || hi < N - 1)) {
    const aL = lo > 0 ? buckets[lo - 1] : 0, aH = hi < N - 1 ? buckets[hi + 1] : 0;
    if (aH >= aL && hi < N - 1) { hi++; vaVol += buckets[hi]; } else if (lo > 0) { lo--; vaVol += buckets[lo]; } else break;
  }
  return { poc: r2(minP + (pocIdx + 0.5) * bSz), vahigh: r2(minP + (hi + 1) * bSz), valow: r2(minP + lo * bSz), levels: buckets.map((vol, i) => ({ price: r2(minP + (i + 0.5) * bSz), volume: vol, pct: totalVol > 0 ? Math.round(vol / totalVol * 100) : 0 })) };
}

// ─── Greeks (BS approximations) ───────────────────────────────────────────────

function bsD1(S: number, K: number, T: number, iv: number): number {
  if (T <= 0 || iv <= 0 || S <= 0 || K <= 0) return 0;
  return (Math.log(S / K) + 0.5 * iv * iv * T) / (iv * Math.sqrt(T));
}

function greeks(S: number, K: number, T: number, iv: number, type: 'call' | 'put') {
  const d1 = bsD1(S, K, T, iv), sqrtT = Math.sqrt(Math.max(T, 1e-6));
  const nd1Pdf = Math.exp(-0.5 * d1 * d1) / SQ2PI;
  const delta  = type === 'call' ? r4(ncdf(d1)) : r4(ncdf(d1) - 1);
  const gamma  = r4(nd1Pdf / (S * iv * sqrtT));
  const vega   = r2(S * sqrtT * nd1Pdf * 0.01);                       // per 1% IV change
  const theta  = T > 0 ? r2(-(S * nd1Pdf * iv / (2 * sqrtT)) / 365) : 0; // per calendar day
  const ivPct  = r2(iv * 100);
  return { delta, gamma, vega, theta, ivPct };
}

// ─── Options scorer ────────────────────────────────────────────────────────────

export interface IntradayScoredOption {
  contractSymbol: string; type: 'call' | 'put'; strike: number; expiration: number; dte: number;
  bid: number; ask: number; mid: number; spreadPct: number; volume: number; openInterest: number;
  delta: number; gamma: number; theta: number; vega: number; ivPct: number; inTheMoney: boolean;
  institutionalActivity: boolean; scalp0DTE: boolean;
  category: 'aggressive' | 'balanced' | 'conservative';
  entryMid: number; target1: number; target2: number; stopLoss: number; rrRatio: number;
  score: number; grade: 'A+' | 'A' | 'B' | 'C'; rationale: string;
}

function scoreIntradayOptions(contracts: RawOption[], type: 'call' | 'put', price: number, bias: 'bullish' | 'bearish' | 'neutral', vwap: number): IntradayScoredOption[] {
  const now = Math.floor(Date.now() / 1000);
  const out: IntradayScoredOption[] = [];
  for (const c of contracts) {
    const dte = Math.max(0, Math.floor((c.expiration - now) / 86400));
    if (dte > 7) continue;
    const bid = c.bid ?? 0, ask = c.ask ?? 0;
    if (bid <= 0 || ask <= 0) continue;
    const mid = r2((bid + ask) / 2), spread = r2(ask - bid);
    const spreadPct = mid > 0 ? r2(spread / mid * 100) : 999;
    if (spreadPct > 40) continue;
    const volume = c.volume ?? 0, oi = c.openInterest ?? 0;
    if (oi < 20 && volume < 20) continue;
    const iv = Math.max(c.impliedVolatility ?? 0.01, 0.01);
    if (iv * 100 > 400) continue;
    const T   = Math.max(dte, 0.25) / 365;
    const g   = greeks(price, c.strike, T, iv, type);
    const pctOtm = type === 'call' ? (c.strike - price) / price * 100 : (price - c.strike) / price * 100;
    const institutionalActivity = volume > oi * 0.25 || oi > 8000;
    const scalp0DTE = dte === 0;

    let score = 0;
    // Liquidity
    score += Math.min(oi / 2000, 1) * 15;
    score += Math.min(volume / 500, 1) * 10;
    score += Math.max(0, 15 - spreadPct / 2.5);
    // Greeks for scalping
    score += Math.abs(g.delta) >= 0.35 && Math.abs(g.delta) <= 0.65 ? 16 : Math.abs(g.delta) >= 0.25 ? 10 : 5;
    score += g.gamma > 0.005 ? 10 : g.gamma > 0.002 ? 6 : 3;   // high gamma = fast moves
    // Moneyness (slight OTM preferred for scalps)
    score += pctOtm >= 0 && pctOtm <= 3 ? 18 : pctOtm > 3 && pctOtm <= 6 ? 12 : pctOtm < 0 && pctOtm >= -2 ? 14 : 5;
    // Direction alignment
    const dirAlign = (type === 'call' && bias === 'bullish') || (type === 'put' && bias === 'bearish');
    score += dirAlign ? 12 : bias === 'neutral' ? 4 : 0;
    // IV for scalp (not too high, not too low)
    score += g.ivPct < 30 ? 6 : g.ivPct < 60 ? 10 : g.ivPct < 100 ? 7 : 3;
    // Institutional
    score += institutionalActivity ? 8 : 0;
    // DTE preference (1-3 DTE best for survival, 0DTE high gamma)
    score += dte === 0 ? 6 : dte === 1 ? 8 : dte <= 3 ? 7 : 5;
    score = Math.min(100, Math.round(score));
    const grade: IntradayScoredOption['grade'] = score >= 80 ? 'A+' : score >= 65 ? 'A' : score >= 48 ? 'B' : 'C';
    if (score < 35) continue;
    const category: IntradayScoredOption['category'] = dte === 0 && Math.abs(g.delta) > 0.5 ? 'aggressive' : dte <= 2 && Math.abs(g.delta) >= 0.35 ? 'balanced' : 'conservative';
    const entryMid = mid, target1 = r2(mid * 1.5), target2 = r2(mid * 2.5), stopLoss = r2(mid * 0.45);
    const rrRatio = stopLoss > 0 ? r2((target1 - entryMid) / (entryMid - stopLoss)) : 0;
    out.push({ contractSymbol: c.contractSymbol, type, strike: c.strike, expiration: c.expiration, dte, bid, ask, mid, spreadPct, volume, openInterest: oi, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, ivPct: g.ivPct, inTheMoney: c.inTheMoney, institutionalActivity, scalp0DTE, category, entryMid, target1, target2, stopLoss, rrRatio, score, grade, rationale: `${dte}DTE · Δ${g.delta.toFixed(2)} · γ${g.gamma.toFixed(4)} · IV${g.ivPct.toFixed(0)}% · OI ${oi.toLocaleString()}` });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

// ─── Intraday regime ───────────────────────────────────────────────────────────

export interface IntradayRegime { type: 'trending_up' | 'trending_down' | 'mean_reversion' | 'range_bound' | 'expansion' | 'distribution' | 'panic'; label: string; description: string; approach: string; }

function classifyIntradayRegime(price: number, vwap: number, vix: number, dailyBias: BiasResult, oneHBias: BiasResult, atr: number): IntradayRegime {
  if (vix > 32) return { type: 'panic', label: 'PANIC', description: 'VIX spike — dislocated market, extreme volatility, wide ranges.', approach: 'Reduced size only. 0DTE high-gamma plays on reversals. Fade extreme moves at key HTF support.' };
  const vwapDist = price > 0 ? Math.abs(price - vwap) / price * 100 : 0;
  const trending = dailyBias.bias === oneHBias.bias && dailyBias.bias !== 'neutral';
  if (trending && dailyBias.bias === 'bullish') return { type: 'trending_up', label: 'TRENDING UP', description: 'Aligned bullish structure on daily + 1H. Price holding above VWAP.', approach: 'Buy dips to VWAP/EMA. Calls on FVG touch. Trail stops. Add on pullbacks.' };
  if (trending && dailyBias.bias === 'bearish') return { type: 'trending_down', label: 'TRENDING DOWN', description: 'Aligned bearish structure. Price holding below VWAP.', approach: 'Sell rips to VWAP/EMA. Puts on FVG rejection. Trail stops aggressively.' };
  if (vix > 22 && dailyBias.strength < 45) return { type: 'distribution', label: 'DISTRIBUTION', description: 'Elevated VIX with weakening structure. Institutional selling detected.', approach: 'Short rallies. Put spreads. Avoid buying premium outright. Reduce size.' };
  if (vwapDist < 0.15 && atr > 0 && Math.abs(price - vwap) < atr * 0.3) return { type: 'mean_reversion', label: 'MEAN REVERSION', description: 'Price oscillating around VWAP. No clear direction. Mean-reverting environment.', approach: 'Fade extremes at VWAP ± 1 ATR. Wait for displacement + reclaim. Iron condors.' };
  if (dailyBias.strength >= 55 && dailyBias.strength <= 65) return { type: 'range_bound', label: 'RANGE BOUND', description: 'Developing structure. Price in balance, no institutional commitment.', approach: 'Wait for BOS/CHoCH. Avoid chasing. Range extremes for defined-risk plays.' };
  if (dailyBias.atr > 0) {
    const last5atr = atr; const expectedRange = last5atr * 2;
    if (vwapDist > 0.5) return { type: 'expansion', label: 'EXPANSION', description: 'Expanding range with strong momentum — directional move in progress.', approach: 'Ride momentum. Entries on micro pullbacks only. Wide stops. Scale out at 2x ATR.' };
  }
  return { type: 'range_bound', label: 'RANGE BOUND', description: 'No clear institutional direction. Mixed timeframe signals.', approach: 'Stay patient. Wait for HTF level interaction with strong reaction.' };
}

// ─── Scenarios ─────────────────────────────────────────────────────────────────

export interface Scenario { direction: 'bullish' | 'bearish'; title: string; entryCondition: string; entryLevel: number | null; target1: number | null; target2: number | null; target3: number | null; stopLevel: number | null; invalidation: string; probability: 'high' | 'medium' | 'low'; }

function buildScenarios(price: number, vwap: number, dailyBias: BiasResult, fvgs: FVGLevel[], structure: StructureEvent[], prevDayHigh: number, prevDayLow: number, weeklyHigh: number, weeklyLow: number, atr: number): { bullish: Scenario; bearish: Scenario } {
  const bullFVG  = fvgs.find(f => f.type === 'bullish' && price > f.mid && (price - f.low) / price < 0.05);
  const bearFVG  = fvgs.find(f => f.type === 'bearish' && price < f.mid && (f.high - price) / price < 0.05);
  const hasBullBOS = structure.some(s => s.event === 'BOS_UP' || s.event === 'CHoCH_UP');
  const hasBearBOS = structure.some(s => s.event === 'BOS_DOWN' || s.event === 'CHoCH_DOWN');

  const bullEntry = bullFVG ? r2(bullFVG.low + (bullFVG.high - bullFVG.low) * 0.2) : r2(vwap * 1.001);
  const bullT1    = r2(prevDayHigh > price ? prevDayHigh : price + atr);
  const bullT2    = r2(price + atr * 2);
  const bullT3    = r2(weeklyHigh > price + atr * 3 ? weeklyHigh : price + atr * 3);
  const bullStop  = r2(bullFVG ? bullFVG.low * 0.999 : vwap * 0.998);
  const bullProb  = hasBullBOS && dailyBias.bias === 'bullish' ? 'high' : dailyBias.bias === 'bullish' ? 'medium' : 'low';

  const bearEntry = bearFVG ? r2(bearFVG.high - (bearFVG.high - bearFVG.low) * 0.2) : r2(vwap * 0.999);
  const bearT1    = r2(prevDayLow < price ? prevDayLow : price - atr);
  const bearT2    = r2(price - atr * 2);
  const bearT3    = r2(weeklyLow < price - atr * 3 ? weeklyLow : price - atr * 3);
  const bearStop  = r2(bearFVG ? bearFVG.high * 1.001 : vwap * 1.002);
  const bearProb  = hasBearBOS && dailyBias.bias === 'bearish' ? 'high' : dailyBias.bias === 'bearish' ? 'medium' : 'low';

  return {
    bullish: { direction: 'bullish', title: bullFVG ? `Bullish FVG reclaim at $${bullFVG.low}` : hasBullBOS ? 'Bullish BOS continuation' : 'VWAP support bounce', entryCondition: bullFVG ? `Price pulls into bullish FVG (${bullFVG.low}–${bullFVG.high}) and holds with strong close` : `Reclaim and hold above VWAP ($${vwap}) with bullish 5m candle confirmation`, entryLevel: bullEntry, target1: bullT1, target2: bullT2, target3: bullT3, stopLevel: bullStop, invalidation: `Close below $${bullStop} or loss of VWAP on volume`, probability: bullProb },
    bearish: { direction: 'bearish', title: bearFVG ? `Bearish FVG rejection at $${bearFVG.high}` : hasBearBOS ? 'Bearish BOS continuation' : 'VWAP resistance rejection', entryCondition: bearFVG ? `Rejection from bearish FVG (${bearFVG.low}–${bearFVG.high}) with momentum close below` : `Failure to reclaim VWAP ($${vwap}) with bearish 5m candle confirmation`, entryLevel: bearEntry, target1: bearT1, target2: bearT2, target3: bearT3, stopLevel: bearStop, invalidation: `Close above $${bearStop} or reclaim of VWAP with strong volume`, probability: bearProb },
  };
}

// ─── No-trade conditions ───────────────────────────────────────────────────────

function noTradeConditions(price: number, vwap: number, vix: number, dailyBias: BiasResult, oneHBias: BiasResult, volumeRatio: number, poc: number, atr: number): string[] {
  const conditions: string[] = [];
  if (Math.abs(price - poc) < atr * 0.25) conditions.push('Price at Point of Control — high noise, avoid mid-range chop');
  if (volumeRatio < 0.65) conditions.push('Below-average volume — thin market, avoid direction bets');
  if (dailyBias.bias !== 'neutral' && oneHBias.bias !== 'neutral' && dailyBias.bias !== oneHBias.bias) conditions.push('Conflicting structure: daily and 1H bias oppose each other');
  if (vix > 30) conditions.push(`VIX ${vix.toFixed(1)} — extreme volatility, premium buying is expensive`);
  const distFromVwap = Math.abs(price - vwap) / vwap * 100;
  if (distFromVwap < 0.08) conditions.push('Price pinned at VWAP — no directional conviction, mean-reversion zone');
  if (dailyBias.rsi > 78) conditions.push('RSI overbought (>78) — elevated reversal risk on calls');
  if (dailyBias.rsi < 22) conditions.push('RSI oversold (<22) — elevated counter-rally risk on puts');
  return conditions;
}

// ─── Confidence score ──────────────────────────────────────────────────────────

function computeConfidence(weeklyBias: BiasResult, dailyBias: BiasResult, fourHBias: BiasResult, oneHBias: BiasResult, structure: StructureEvent[], fvgs: FVGLevel[], vix: number, volumeRatio: number, topOptions: IntradayScoredOption[]): number {
  let score = 40;
  const biases = [weeklyBias.bias, dailyBias.bias, fourHBias.bias, oneHBias.bias].filter(b => b !== 'neutral');
  const aligned = biases.length >= 3 && biases.every(b => b === biases[0]);
  if (aligned) score += 20;
  else if (biases.length >= 2 && biases[0] === biases[1]) score += 10;
  if (structure.some(s => s.significance === 'major')) score += 12;
  else if (structure.length > 0) score += 5;
  if (fvgs.some(f => f.strength === 'strong')) score += 8;
  if (vix >= 14 && vix <= 22) score += 8;
  else if (vix > 28) score -= 10;
  if (volumeRatio >= 1.2) score += 5;
  else if (volumeRatio < 0.7) score -= 8;
  if (topOptions.some(o => o.grade === 'A+')) score += 7;
  else if (topOptions.some(o => o.grade === 'A')) score += 4;
  return Math.min(96, Math.max(18, Math.round(score)));
}

// ─── Overall bias ──────────────────────────────────────────────────────────────

function computeOverallBias(weeklyBias: BiasResult, dailyBias: BiasResult, fourHBias: BiasResult, oneHBias: BiasResult, price: number, vwap: number): { bias: 'bullish' | 'bearish' | 'neutral'; strength: number; reason: string } {
  const biases = [weeklyBias.bias, dailyBias.bias, fourHBias.bias, oneHBias.bias];
  const bullCount = biases.filter(b => b === 'bullish').length;
  const bearCount = biases.filter(b => b === 'bearish').length;
  const vwapBull  = price > vwap;
  if (bullCount >= 3 && vwapBull) return { bias: 'bullish', strength: Math.round(55 + bullCount * 8), reason: `${bullCount}/4 timeframes bullish + price above VWAP` };
  if (bearCount >= 3 && !vwapBull) return { bias: 'bearish', strength: Math.round(55 + bearCount * 8), reason: `${bearCount}/4 timeframes bearish + price below VWAP` };
  if (bullCount > bearCount && vwapBull) return { bias: 'bullish', strength: 58, reason: `Majority bullish + above VWAP` };
  if (bearCount > bullCount && !vwapBull) return { bias: 'bearish', strength: 58, reason: `Majority bearish + below VWAP` };
  return { bias: 'neutral', strength: 50, reason: 'Mixed timeframe signals — wait for structure clarity' };
}

// ─── Dynamic discovery ─────────────────────────────────────────────────────────

const INTRADAY_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META', 'AMZN', 'GOOGL', 'TSLA', 'NFLX', 'AVGO', 'PLTR', 'COIN', 'MSTR'];
const DISCOVERY_UNIVERSE = ['SMCI', 'ARM', 'MU', 'INTC', 'QCOM', 'MRVL', 'PANW', 'CRWD', 'DDOG', 'NET', 'SNOW', 'SHOP', 'NOW', 'CRM', 'UBER', 'RBLX', 'HOOD', 'RDDT', 'ABNB', 'DASH', 'TTD', 'ROKU'];

interface DiscoveredTicker { symbol: string; price: number; changePct: number; gapPct: number; volumeRatio: number; reason: string; }

function findDiscoveries(quotes: Map<string, QuoteData>): DiscoveredTicker[] {
  const out: DiscoveredTicker[] = [];
  for (const sym of DISCOVERY_UNIVERSE) {
    const q = quotes.get(sym); if (!q || q.price <= 0) continue;
    const gapPct = q.prevClose > 0 ? r2((q.open - q.prevClose) / q.prevClose * 100) : 0;
    const volumeRatio = 1; // will be enhanced when we have avg volume
    const reasons: string[] = [];
    if (Math.abs(gapPct) > 2) reasons.push(`Gap ${gapPct > 0 ? 'up' : 'down'} ${Math.abs(gapPct).toFixed(1)}%`);
    if (Math.abs(q.changePct) > 3) reasons.push(`Strong move ${q.changePct > 0 ? '+' : ''}${q.changePct.toFixed(1)}%`);
    if (reasons.length > 0) out.push({ symbol: sym, price: q.price, changePct: q.changePct, gapPct, volumeRatio, reason: reasons.join(' · ') });
  }
  return out.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 6);
}

// ─── Main single-symbol analysis ──────────────────────────────────────────────

async function analyzeSymbol(symbol: string) {
  const [candles5m, candles15m, candles1h, candlesDaily, candlesWeekly, optionsData, vixQ, esQ, nqQ] = await Promise.all([
    fetchCandles(symbol, '5m', '2d'),
    fetchCandles(symbol, '15m', '5d'),
    fetchCandles(symbol, '1h', '1mo'),
    fetchCandles(symbol, '1d', '6mo'),
    fetchCandles(symbol, '1wk', '2y'),
    fetchOptionsAll(symbol, 7),
    fetchQuote('^VIX'),
    fetchQuote('ES=F'),
    fetchQuote('NQ=F'),
  ]);

  const price = optionsData.price || candlesDaily[candlesDaily.length - 1]?.close || 0;
  const vix   = vixQ?.price ?? 18;

  // Candle-based data
  const candles4h  = aggregate(candles1h, 4);
  const vwap       = calcVWAP(candles5m.length >= 10 ? candles5m : candles15m);
  const weeklyBias = computeBias(candlesWeekly);
  const dailyBias  = computeBias(candlesDaily);
  const fourHBias  = computeBias(candles4h.length >= 22 ? candles4h : candlesDaily.slice(-80));
  const oneHBias   = computeBias(candles1h.length >= 22 ? candles1h : candlesDaily.slice(-50));
  const fif15mBias = computeBias(candles15m.length >= 22 ? candles15m : candles1h.slice(-50));

  // Price levels
  const prevDay     = candlesDaily.slice(-2)[0] ?? candlesDaily[candlesDaily.length - 1];
  const prevDayHigh = prevDay ? r2(prevDay.high) : 0;
  const prevDayLow  = prevDay ? r2(prevDay.low)  : 0;
  const wkCandles   = candlesWeekly.slice(-2)[0] ?? candlesWeekly[candlesWeekly.length - 1];
  const weeklyHigh  = wkCandles ? r2(wkCandles.high) : 0;
  const weeklyLow   = wkCandles ? r2(wkCandles.low)  : 0;

  // Structure
  const fvgsDaily  = detectFVGs(candlesDaily, symbol, 'daily');
  const fvgs1h     = detectFVGs(candles1h.length >= 10 ? candles1h : candlesDaily, symbol, '1h');
  const fvgs15m    = candles15m.length >= 10 ? detectFVGs(candles15m, symbol, '15m') : [];
  const allFVGs    = [...fvgsDaily, ...fvgs1h, ...fvgs15m].slice(0, 12);

  const structDaily  = detectStructure(candlesDaily, 'daily');
  const struct1h     = detectStructure(candles1h.length >= 15 ? candles1h : candlesDaily, '1h');
  const struct15m    = candles15m.length >= 15 ? detectStructure(candles15m, '15m') : [];
  const allStructure = [...structDaily, ...struct1h, ...struct15m];

  const sweeps5m  = candles5m.length >= 15 ? detectLiquiditySweeps(candles5m, '5m') : [];
  const sweeps15m = candles15m.length >= 15 ? detectLiquiditySweeps(candles15m, '15m') : [];
  const allSweeps = [...sweeps5m, ...sweeps15m].slice(0, 6);

  // Volume profile & zone
  const today5m   = candles5m.length >= 10 ? candles5m.slice(-78) : candles15m.slice(-26);
  const volProfile = computeVolumeProfile(today5m.length >= 5 ? today5m : candlesDaily.slice(-20));
  const recentHigh = Math.max(...candlesDaily.slice(-20).map(c => c.high));
  const recentLow  = Math.min(...candlesDaily.slice(-20).map(c => c.low));
  const equil      = r2((recentHigh + recentLow) / 2);
  const zone: 'premium' | 'discount' | 'equilibrium' = price > equil * 1.002 ? 'premium' : price < equil * 0.998 ? 'discount' : 'equilibrium';

  // Key resistance/support levels from swings
  const dailySwings = detectSwings(candlesDaily, 3);
  const recentHighs = dailySwings.filter(s => s.type === 'high' && s.price > price).slice(-3).map(s => r2(s.price)).sort((a, b) => a - b);
  const recentLows  = dailySwings.filter(s => s.type === 'low'  && s.price < price).slice(-3).map(s => r2(s.price)).sort((a, b) => b - a);

  // Regime
  const atrD = dailyBias.atr || calcATR(candlesDaily, 14);
  const regime = classifyIntradayRegime(price, vwap, vix, dailyBias, oneHBias, atrD);

  // Options
  const { bias: overallBias, strength: biasStrength, reason: biasReason } = computeOverallBias(weeklyBias, dailyBias, fourHBias, oneHBias, price, vwap);
  const topCalls = scoreIntradayOptions(optionsData.calls, 'call', price, overallBias, vwap);
  const topPuts  = scoreIntradayOptions(optionsData.puts,  'put',  price, overallBias, vwap);
  const bestRR   = [...topCalls, ...topPuts].sort((a, b) => b.rrRatio - a.rrRatio)[0] ?? null;

  // Scenarios
  const { bullish: bullishScenario, bearish: bearishScenario } = buildScenarios(price, vwap, dailyBias, allFVGs, allStructure, prevDayHigh, prevDayLow, weeklyHigh, weeklyLow, atrD);

  // Volume ratio (today vs 20d avg)
  const avgVol = candlesDaily.slice(-21, -1).reduce((s, c) => s + c.volume, 0) / 20;
  const todayVol = candlesDaily[candlesDaily.length - 1]?.volume ?? 0;
  const volumeRatio = avgVol > 0 ? r2(todayVol / avgVol) : 1;

  // No-trade + confidence
  const noTrade = noTradeConditions(price, vwap, vix, dailyBias, oneHBias, volumeRatio, volProfile.poc, atrD);
  const confidence = computeConfidence(weeklyBias, dailyBias, fourHBias, oneHBias, allStructure, allFVGs, vix, volumeRatio, [...topCalls, ...topPuts]);

  // Entry triggers
  const longTriggers = [
    vwap > 0 ? `Reclaim and hold above VWAP ($${vwap}) on a 5m close` : null,
    allFVGs.find(f => f.type === 'bullish' && price > f.low && price < f.high * 1.01) ? `Price inside bullish FVG — watch for strong close above $${allFVGs.find(f => f.type === 'bullish')?.high}` : null,
    allStructure.some(s => s.event === 'BOS_UP' || s.event === 'CHoCH_UP') ? `${allStructure.find(s => s.event === 'BOS_UP' || s.event === 'CHoCH_UP')!.description} — enter on 15m confirmation` : null,
    prevDayHigh > 0 && Math.abs(price - prevDayHigh) / price < 0.005 ? `Testing prev day high ($${prevDayHigh}) — breakout above triggers long` : null,
  ].filter(Boolean) as string[];

  const shortTriggers = [
    vwap > 0 ? `Failed reclaim of VWAP ($${vwap}) — close below on volume` : null,
    allFVGs.find(f => f.type === 'bearish' && price < f.high && price > f.low * 0.99) ? `Rejection from bearish FVG — watch for close below $${allFVGs.find(f => f.type === 'bearish')?.low}` : null,
    allStructure.some(s => s.event === 'BOS_DOWN' || s.event === 'CHoCH_DOWN') ? `${allStructure.find(s => s.event === 'BOS_DOWN' || s.event === 'CHoCH_DOWN')!.description} — enter on 15m confirmation` : null,
    prevDayLow > 0 && Math.abs(price - prevDayLow) / price < 0.005 ? `Testing prev day low ($${prevDayLow}) — breakdown triggers short` : null,
  ].filter(Boolean) as string[];

  const breadthSyms = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLI', 'SPY'];

  return {
    symbol, price: r2(price),
    changePct: r2((candlesDaily[candlesDaily.length - 1]?.close / (candlesDaily[candlesDaily.length - 2]?.close ?? 1) - 1) * 100),
    vwap, priceVsVwap: price > vwap * 1.0005 ? 'above' as const : price < vwap * 0.9995 ? 'below' as const : 'at' as const,
    prevDayHigh, prevDayLow, weeklyHigh, weeklyLow, equil, zone,
    resistanceLevels: recentHighs, supportLevels: recentLows,
    volumeProfile: volProfile,
    futures: { es: r2(esQ?.price ?? 0), esChange: r2(esQ?.changePct ?? 0), nq: r2(nqQ?.price ?? 0), nqChange: r2(nqQ?.changePct ?? 0) },
    vix, vixChange: r2(vixQ?.changePct ?? 0), vixRegime: vix < 14 ? 'low' as const : vix < 20 ? 'normal' as const : vix < 30 ? 'elevated' as const : 'extreme' as const,
    weeklyBias, dailyBias, fourHBias, oneHBias, fif15mBias,
    fvgLevels: allFVGs, structureEvents: allStructure, liquiditySweeps: allSweeps,
    regime, overallBias, biasStrength, biasReason,
    bullishScenario, bearishScenario,
    topCalls: topCalls.slice(0, 5), topPuts: topPuts.slice(0, 5), bestRR,
    entryTriggers: { long: longTriggers.slice(0, 3), short: shortTriggers.slice(0, 3) },
    stopLoss: { long: r2(vwap * 0.997), short: r2(vwap * 1.003) },
    targets: { long: [r2(prevDayHigh || price + atrD), r2(price + atrD * 2), r2(weeklyHigh || price + atrD * 3)], short: [r2(prevDayLow || price - atrD), r2(price - atrD * 2), r2(weeklyLow || price - atrD * 3)] },
    noTradeConditions: noTrade, volumeRatio, confidenceScore: confidence,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Scanner mode ─────────────────────────────────────────────────────────────

async function runScan() {
  const allSyms = Array.from(new Set([...INTRADAY_WATCHLIST, ...DISCOVERY_UNIVERSE]));
  const [quotes, vixQ, esQ, nqQ] = await Promise.all([fetchMultiQuote(allSyms), fetchQuote('^VIX'), fetchQuote('ES=F'), fetchQuote('NQ=F')]);
  const vix = vixQ?.price ?? 18;
  const discoveredTickers = findDiscoveries(quotes);

  const dailyCandlePairs = await Promise.all(INTRADAY_WATCHLIST.map(s => fetchCandles(s, '1d', '3mo').then(c => [s, c] as [string, CandleData[]])));
  const candleMap = new Map(dailyCandlePairs);

  type ScanEntry = { symbol: string; price: number; changePct: number; gapPct: number; bias: 'bullish' | 'bearish' | 'neutral'; biasStrength: number; regime: string; vwap: number; priceVsVwap: string; fvgCount: number; bosEvent: string; confidenceScore: number; topOption?: IntradayScoredOption; reason: string; };
  const scanResults: ScanEntry[] = [];

  for (const sym of INTRADAY_WATCHLIST) {
    const daily = candleMap.get(sym) ?? []; if (daily.length < 22) continue;
    const q = quotes.get(sym); const price = q?.price ?? daily[daily.length - 1]?.close ?? 0; if (!price) continue;
    const dailyBias = computeBias(daily);
    const weeklyBias = (() => { const src = daily.slice(-65); const wk: CandleData[] = []; for (let i = 0; i < src.length; i += 5) { const ch = src.slice(i, i + 5); if (!ch.length) continue; wk.push({ time: ch[0].time, open: ch[0].open, high: Math.max(...ch.map(c => c.high)), low: Math.min(...ch.map(c => c.low)), close: ch[ch.length - 1].close, volume: ch.reduce((s, c) => s + c.volume, 0) }); } return computeBias(wk); })();
    const fvgs = detectFVGs(daily, sym, 'daily');
    const structure = detectStructure(daily, 'daily');
    const atr = dailyBias.atr || calcATR(daily, 14);
    const vwap = r2(daily.slice(-5).reduce((s, c) => s + (c.high + c.low + c.close) / 3, 0) / 5);
    const { bias: ob, strength: bs, reason } = computeOverallBias(weeklyBias, dailyBias, dailyBias, dailyBias, price, vwap);
    const bosEvent = structure.find(s => s.significance === 'major')?.event ?? structure[0]?.event ?? '';
    const gapPct = q && q.prevClose > 0 ? r2((q.open - q.prevClose) / q.prevClose * 100) : 0;
    let conf = 45;
    if (weeklyBias.bias === dailyBias.bias && dailyBias.bias !== 'neutral') conf += 18;
    if (structure.some(s => s.significance === 'major')) conf += 14;
    if (fvgs.some(f => f.strength === 'strong')) conf += 8;
    if (Math.abs(gapPct) > 1.5) conf += 6;
    conf = Math.min(94, Math.max(20, conf));
    scanResults.push({ symbol: sym, price, changePct: q?.changePct ?? 0, gapPct, bias: ob, biasStrength: bs, regime: classifyIntradayRegime(price, vwap, vix, dailyBias, dailyBias, atr).label, vwap, priceVsVwap: price > vwap ? 'above' : 'below', fvgCount: fvgs.length, bosEvent, confidenceScore: conf, reason });
  }
  scanResults.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    success: true, scanResults,
    discoveredTickers,
    futures: { es: r2(esQ?.price ?? 0), esChange: r2(esQ?.changePct ?? 0), nq: r2(nqQ?.price ?? 0), nqChange: r2(nqQ?.changePct ?? 0) },
    vix, vixChange: r2(vixQ?.changePct ?? 0),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode   = req.nextUrl.searchParams.get('mode');
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'SPY').toUpperCase().trim();
  try {
    if (mode === 'scan') {
      const data = await runScan();
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await analyzeSymbol(symbol);
    return NextResponse.json({ success: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Intraday scanner unavailable' }, { status: 503 });
  }
}
