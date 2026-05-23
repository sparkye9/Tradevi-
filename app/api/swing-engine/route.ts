import { NextRequest, NextResponse } from 'next/server';
import { calcEMA, calcRSI, calcATR } from '@/lib/indicators';
import type { CandleData } from '@/lib/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

// ─── Quote ────────────────────────────────────────────────────────────────────

interface QuoteData {
  price: number; change: number; changePct: number;
  prevClose: number; high: number; low: number; volume: number;
}

async function fetchQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0);
    const prev  = Number(meta.previousClose ?? price);
    return {
      price: r2(price), change: r2(price - prev),
      changePct: r2(prev > 0 ? ((price - prev) / prev) * 100 : 0),
      prevClose: r2(prev),
      high:   r2(Number(meta.regularMarketDayHigh ?? price)),
      low:    r2(Number(meta.regularMarketDayLow  ?? price)),
      volume: Number(meta.regularMarketVolume ?? 0),
    };
  } catch { return null; }
}

async function fetchMultiQuote(symbols: string[]): Promise<Map<string, QuoteData>> {
  const result = new Map<string, QuoteData>();
  if (!symbols.length) return result;
  try {
    const str = symbols.map(s => encodeURIComponent(s)).join('%2C');
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${str}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketChangePercent`,
      { headers: YF_HEADERS, cache: 'no-store' }
    );
    if (!res.ok) return result;
    const json = await res.json();
    for (const q of (json?.quoteResponse?.result ?? [])) {
      const price = Number(q.regularMarketPrice ?? 0);
      const prev  = Number(q.regularMarketPreviousClose ?? price);
      result.set(q.symbol, {
        price: r2(price), change: r2(price - prev),
        changePct: r2(Number(q.regularMarketChangePercent ?? 0)),
        prevClose: r2(prev),
        high:   r2(Number(q.regularMarketDayHigh ?? price)),
        low:    r2(Number(q.regularMarketDayLow  ?? price)),
        volume: Number(q.regularMarketVolume ?? 0),
      });
    }
  } catch { /* silent */ }
  return result;
}

// ─── Candles ──────────────────────────────────────────────────────────────────

async function fetchCandles(symbol: string, interval: string, range: string): Promise<CandleData[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      + `?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    return ts.map((t, i) => ({
      time: t, open: q.open?.[i] ?? 0, high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0, close: q.close?.[i] ?? 0, volume: q.volume?.[i] ?? 0,
    })).filter(c => c.close > 0 && c.high > 0);
  } catch { return []; }
}

function aggregate4H(hourly: CandleData[]): CandleData[] {
  const out: CandleData[] = [];
  for (let i = 0; i < hourly.length; i += 4) {
    const chunk = hourly.slice(i, i + 4);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time, open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)), low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close, volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

function computeWeeklyBiasFromDaily(daily: CandleData[]): BiasResult {
  const src = daily.slice(-65);
  const weekly: CandleData[] = [];
  for (let i = 0; i < src.length; i += 5) {
    const chunk = src.slice(i, i + 5);
    if (!chunk.length) continue;
    weekly.push({
      time: chunk[0].time, open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)), low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close, volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return computeBias(weekly);
}

// ─── Technical helpers ────────────────────────────────────────────────────────

function lastValid(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--)
    if (Number.isFinite(arr[i]) && !Number.isNaN(arr[i])) return arr[i];
  return null;
}

interface SwingPoint { index: number; price: number; type: 'high' | 'low'; }

function detectSwingPoints(candles: CandleData[], lb = 3): SwingPoint[] {
  const pts: SwingPoint[] = [];
  for (let i = lb; i < candles.length - lb; i++) {
    const win = candles.slice(i - lb, i + lb + 1);
    const isH = win.every((c, j) => j === lb || c.high  <= candles[i].high);
    const isL = win.every((c, j) => j === lb || c.low   >= candles[i].low);
    if (isH) pts.push({ index: i, price: candles[i].high, type: 'high' });
    if (isL) pts.push({ index: i, price: candles[i].low,  type: 'low'  });
  }
  return pts;
}

// ─── FVG detection ────────────────────────────────────────────────────────────

export interface FVGLevel {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  type: 'bullish' | 'bearish'; high: number; low: number; mid: number;
  filled: boolean; ageCandles: number; strength: 'strong' | 'moderate' | 'weak';
}

function detectFVGs(candles: CandleData[], symbol: string, tf: FVGLevel['timeframe']): FVGLevel[] {
  const out: FVGLevel[] = [];
  const curPrice = candles[candles.length - 1]?.close ?? 0;
  for (let i = 1; i < candles.length - 1; i++) {
    const [prev, , next] = [candles[i - 1], candles[i], candles[i + 1]];
    const currC = candles[i];
    if (next.low > prev.high && currC.close > currC.open) {
      const hi = next.low, lo = prev.high, sz = hi - lo;
      if (sz / currC.close < 0.001) continue;
      const filled = candles.slice(i + 2).some(c => c.low <= hi && c.high >= lo);
      const age = candles.length - 1 - i;
      if (!filled && Math.abs(curPrice - (hi + lo) / 2) / curPrice < 0.12)
        out.push({ symbol, timeframe: tf, type: 'bullish', high: r2(hi), low: r2(lo), mid: r2((hi + lo) / 2), filled, ageCandles: age, strength: sz / currC.close > 0.01 ? 'strong' : sz / currC.close > 0.004 ? 'moderate' : 'weak' });
    }
    if (next.high < prev.low && currC.close < currC.open) {
      const hi = prev.low, lo = next.high, sz = hi - lo;
      if (sz / currC.close < 0.001) continue;
      const filled = candles.slice(i + 2).some(c => c.high >= lo && c.low <= hi);
      const age = candles.length - 1 - i;
      if (!filled && Math.abs(curPrice - (hi + lo) / 2) / curPrice < 0.12)
        out.push({ symbol, timeframe: tf, type: 'bearish', high: r2(hi), low: r2(lo), mid: r2((hi + lo) / 2), filled, ageCandles: age, strength: sz / currC.close > 0.01 ? 'strong' : sz / currC.close > 0.004 ? 'moderate' : 'weak' });
    }
  }
  const bull = out.filter(f => f.type === 'bullish').slice(-4);
  const bear = out.filter(f => f.type === 'bearish').slice(-4);
  return [...bull, ...bear];
}

// ─── BOS / CHoCH ──────────────────────────────────────────────────────────────

export interface StructureEvent {
  symbol: string; timeframe: 'weekly' | 'daily' | '4h';
  event: 'BOS_UP' | 'BOS_DOWN' | 'CHoCH_UP' | 'CHoCH_DOWN';
  level: number; ageCandles: number;
  significance: 'major' | 'minor'; description: string;
}

function detectStructure(candles: CandleData[], symbol: string, tf: StructureEvent['timeframe']): StructureEvent[] {
  if (candles.length < 15) return [];
  const events: StructureEvent[] = [];
  const lb = tf === 'weekly' ? 2 : 3;
  const swings = detectSwingPoints(candles, lb);
  const highs = swings.filter(s => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows  = swings.filter(s => s.type === 'low').sort((a, b) => a.index - b.index);
  const last  = candles[candles.length - 1].close;

  const recentHighs = highs.filter(h => h.index < candles.length - lb - 1).slice(-4);
  for (const sh of recentHighs.reverse()) {
    if (last > sh.price) {
      const age = candles.length - 1 - sh.index;
      const prevH = highs.filter(h => h.index < sh.index).slice(-1)[0];
      const isChoCH = prevH ? prevH.price > sh.price : false;
      events.push({ symbol, timeframe: tf, event: isChoCH ? 'CHoCH_UP' : 'BOS_UP', level: r2(sh.price), ageCandles: age, significance: age <= 5 ? 'major' : 'minor', description: isChoCH ? `Bullish CHoCH — broke above ${r2(sh.price)} reversing downtrend` : `Bullish BOS — continuation above swing high ${r2(sh.price)}` });
      break;
    }
  }

  const recentLows = lows.filter(l => l.index < candles.length - lb - 1).slice(-4);
  for (const sl of recentLows.reverse()) {
    if (last < sl.price) {
      const age = candles.length - 1 - sl.index;
      const prevL = lows.filter(l => l.index < sl.index).slice(-1)[0];
      const isChoCH = prevL ? prevL.price < sl.price : false;
      events.push({ symbol, timeframe: tf, event: isChoCH ? 'CHoCH_DOWN' : 'BOS_DOWN', level: r2(sl.price), ageCandles: age, significance: age <= 5 ? 'major' : 'minor', description: isChoCH ? `Bearish CHoCH — broke below ${r2(sl.price)} reversing uptrend` : `Bearish BOS — continuation below swing low ${r2(sl.price)}` });
      break;
    }
  }
  return events;
}

// ─── Bias computation ─────────────────────────────────────────────────────────

export interface BiasResult {
  bias: 'bullish' | 'bearish' | 'neutral'; strength: number;
  ema9: number | null; ema21: number | null; ema50: number | null;
  rsi: number; atr: number;
  priceVsEma21: 'above' | 'below'; ema9AboveEma21: boolean; notes: string[];
}

function computeBias(candles: CandleData[]): BiasResult {
  const empty: BiasResult = { bias: 'neutral', strength: 50, ema9: null, ema21: null, ema50: null, rsi: 50, atr: 0, priceVsEma21: 'above', ema9AboveEma21: false, notes: ['Insufficient data'] };
  if (candles.length < 22) return empty;
  const closes = candles.map(c => c.close);
  const price  = closes[closes.length - 1];
  const ema9   = lastValid(calcEMA(closes, 9));
  const ema21  = lastValid(calcEMA(closes, 21));
  const ema50  = lastValid(calcEMA(closes, 50));
  const rsi    = lastValid(calcRSI(closes, 14)) ?? 50;
  const atr    = calcATR(candles, 14);
  const notes: string[] = [];
  let b = 0, br = 0;
  const add = (bull: boolean, pts: number, msg: string) => { bull ? (b += pts) : (br += pts); notes.push(msg); };
  if (ema9  != null) add(price > ema9,  2, price > ema9  ? 'Above EMA9'  : 'Below EMA9');
  if (ema21 != null) add(price > ema21, 3, price > ema21 ? 'Above EMA21' : 'Below EMA21');
  if (ema50 != null) add(price > ema50, 3, price > ema50 ? 'Above EMA50' : 'Below EMA50');
  if (ema9 != null && ema21 != null) add(ema9 > ema21, 2, ema9 > ema21 ? 'EMA9 > EMA21 (bullish cross)' : 'EMA9 < EMA21 (bearish cross)');
  add(rsi > 55, 2, rsi > 70 ? `RSI ${rsi.toFixed(0)} — overbought` : rsi > 55 ? `RSI ${rsi.toFixed(0)} — bullish` : rsi < 30 ? `RSI ${rsi.toFixed(0)} — oversold` : `RSI ${rsi.toFixed(0)} — bearish`);
  const total = b + br;
  const strength = total > 0 ? Math.round((b / total) * 100) : 50;
  return {
    bias: strength >= 62 ? 'bullish' : strength <= 38 ? 'bearish' : 'neutral',
    strength, ema9: ema9 != null ? r2(ema9) : null,
    ema21: ema21 != null ? r2(ema21) : null, ema50: ema50 != null ? r2(ema50) : null,
    rsi: r1(rsi), atr: r2(atr),
    priceVsEma21: (ema21 != null && price > ema21) ? 'above' : 'below',
    ema9AboveEma21: !!(ema9 != null && ema21 != null && ema9 > ema21),
    notes,
  };
}

// ─── Market regime ────────────────────────────────────────────────────────────

function classifyRegime(daily: CandleData[], weekly: CandleData[], vix: number) {
  const dailyB  = computeBias(daily);
  const weeklyB = weekly.length >= 22 ? computeBias(weekly) : null;
  const last20  = daily.slice(-20);
  const range20 = last20.length ? Math.max(...last20.map(c => c.high)) - Math.min(...last20.map(c => c.low)) : 0;
  const atr     = dailyB.atr > 0 ? dailyB.atr : 1;
  const atrRatio = range20 / (atr * 20);
  if (vix > 30) return { phase: 'reversal' as const, description: 'VIX spike — potential capitulation or trend reversal. Market dislocated.', tradingApproach: 'Wait for VIX to stabilize. Long strangles for volatility crush plays. Fade extreme moves at HTF support.', avoidList: ['Buying expensive premium', 'Naked directional bets', 'Chasing breakdowns'] };
  if (atrRatio > 1.3 && dailyB.strength >= 62) return { phase: 'expansion' as const, description: 'Expansion phase — strong directional momentum, widening daily ranges.', tradingApproach: 'Ride momentum. Pullbacks to EMA9/EMA21 are entries. Use trailing stops. Favor calls in uptrend.', avoidList: ['Countertrend fades', 'Mean reversion setups', 'Selling naked calls in uptrend'] };
  if (vix > 22 && dailyB.strength < 45) return { phase: 'distribution' as const, description: 'Distribution phase — elevated VIX, weakening breadth, institutional selling.', tradingApproach: 'Reduce long exposure. Put debit spreads, protective hedges. Cash is a position.', avoidList: ['Aggressive longs', 'Low-delta calls', 'Ignoring stop losses'] };
  if (atrRatio < 0.65 && vix < 18) return { phase: 'accumulation' as const, description: 'Accumulation — low volatility coil. Smart money building positions quietly.', tradingApproach: 'Buy dips in strong sectors. Defined risk structures (spreads). Anticipate breakout.', avoidList: ['Buying OTM weekly premium', 'Wide stops', 'Overtrading the chop'] };
  if (weeklyB?.bias === 'bullish' && dailyB.bias !== 'bearish') return { phase: 'expansion' as const, description: 'Weekly bullish structure intact. Daily in continuation mode.', tradingApproach: 'Trend continuation. Buy pullbacks to EMA21. Calls on dips to HTF FVG.', avoidList: ['Shorting into weekly strength', 'Chasing extended breakouts'] };
  return { phase: 'ranging' as const, description: 'Range-bound / developing. No clear directional conviction at current timeframe.', tradingApproach: 'Reduce size. Wait for HTF level test or breakout with volume. Iron condors for range-bound.', avoidList: ['Large directional bets', 'Momentum chasing', 'Short-DTE options'] };
}

// ─── Options chain ────────────────────────────────────────────────────────────

interface YahooOption {
  contractSymbol: string; strike: number;
  bid: number; ask: number; lastPrice: number;
  volume?: number; openInterest?: number;
  impliedVolatility: number; inTheMoney: boolean; expiration: number;
}

async function fetchOptionsChain(symbol: string): Promise<{ price: number; calls: YahooOption[]; puts: YahooOption[]; expirationDates: number[] }> {
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}`, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return { price: 0, calls: [], puts: [], expirationDates: [] };
    const json = await res.json();
    const r = json?.optionChain?.result?.[0];
    if (!r) return { price: 0, calls: [], puts: [], expirationDates: [] };
    const opts = r.options?.[0] ?? {};
    return { price: Number(r.quote?.regularMarketPrice ?? 0), calls: (opts.calls ?? []) as YahooOption[], puts: (opts.puts ?? []) as YahooOption[], expirationDates: (r.expirationDates ?? []) as number[] };
  } catch { return { price: 0, calls: [], puts: [], expirationDates: [] }; }
}

async function fetchExpiry(symbol: string, expDate: number): Promise<{ calls: YahooOption[]; puts: YahooOption[] }> {
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}?date=${expDate}`, { headers: YF_HEADERS, cache: 'no-store' });
    if (!res.ok) return { calls: [], puts: [] };
    const json = await res.json();
    const opts = json?.optionChain?.result?.[0]?.options?.[0] ?? {};
    return { calls: (opts.calls ?? []) as YahooOption[], puts: (opts.puts ?? []) as YahooOption[] };
  } catch { return { calls: [], puts: [] }; }
}

// ─── Score contracts ──────────────────────────────────────────────────────────

export interface ScoredOption {
  contractSymbol: string; symbol: string; type: 'call' | 'put';
  strike: number; expiration: number; dte: number;
  bid: number; ask: number; mid: number; spread: number; spreadPct: number;
  volume: number; openInterest: number; iv: number; ivPct: number;
  inTheMoney: boolean; moneyness: number; deltaApprox: number;
  expectedMoveByExp: number; probabilityOtm: number;
  entryMid: number; target1: number; target2: number; stopLoss: number;
  rrRatio: number; holdDays: number; thetaEstDailyPct: number;
  swingScore: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D'; rationale: string;
}

const ncdf = (x: number) => (1 + Math.sign(x) * (1 - Math.exp(-0.717 * Math.abs(x) - 0.416 * x * x))) / 2;

function scoreContracts(contracts: YahooOption[], type: 'call' | 'put', symbol: string, currentPrice: number, macroDirection: 'bullish' | 'bearish'): ScoredOption[] {
  const now = Math.floor(Date.now() / 1000);
  const out: ScoredOption[] = [];
  for (const c of contracts) {
    const dte = Math.floor((c.expiration - now) / 86400);
    if (dte < 14 || dte > 60) continue;
    const bid = c.bid ?? 0, ask = c.ask ?? 0;
    if (bid <= 0 || ask <= 0) continue;
    const mid = r2((bid + ask) / 2), spread = r2(ask - bid);
    const spreadPct = mid > 0 ? r2((spread / mid) * 100) : 999;
    if (spreadPct > 35) continue;
    const volume = c.volume ?? 0, oi = c.openInterest ?? 0;
    if (oi < 30 && volume < 30) continue;
    const iv = Math.max(c.impliedVolatility ?? 0, 0.01), ivPct = r2(iv * 100);
    if (ivPct > 300) continue;
    const moneyness = r2(c.strike / currentPrice);
    const pctOtm = type === 'call' ? (c.strike - currentPrice) / currentPrice * 100 : (currentPrice - c.strike) / currentPrice * 100;
    const diff = (c.strike - currentPrice) / currentPrice;
    const deltaApprox = type === 'call'
      ? (diff < -0.05 ? 0.72 : diff < 0.01 ? 0.50 : diff < 0.08 ? 0.35 : diff < 0.18 ? 0.22 : 0.12)
      : (diff > 0.05 ? -0.72 : diff > -0.01 ? -0.50 : diff > -0.08 ? -0.35 : diff > -0.18 ? -0.22 : -0.12);
    const sqrtT = Math.sqrt(dte / 365);
    const expectedMoveByExp = r2(currentPrice * iv * sqrtT);
    const d2 = currentPrice > 0 && c.strike > 0 ? (Math.log(currentPrice / c.strike) + (-0.5 * iv * iv) * (dte / 365)) / (iv * sqrtT) : 0;
    const probabilityOtm = type === 'call' ? r2((1 - ncdf(d2)) * 100) : r2(ncdf(d2) * 100);
    const entryMid = mid, target1 = r2(mid * 1.65), target2 = r2(mid * 2.6), stopLoss = r2(mid * 0.45);
    const rrRatio = stopLoss > 0 ? r2((target1 - entryMid) / (entryMid - stopLoss)) : 0;
    const holdDays = Math.max(5, Math.min(dte - 7, Math.round(dte * 0.55)));
    const thetaEstDailyPct = dte > 0 ? r2((mid * iv / (2 * sqrtT)) / dte * 100) : 0;
    let score = 0;
    score += Math.min(oi / 1000, 1) * 12;
    score += Math.min(volume / 300, 1) * 6;
    score += Math.max(0, 12 - spreadPct / 3);
    score += dte >= 28 && dte <= 45 ? 14 : dte >= 20 ? 10 : 6;
    score += pctOtm >= 1 && pctOtm <= 7 ? 20 : pctOtm >= 0 && pctOtm < 1 ? 14 : pctOtm > 7 && pctOtm <= 14 ? 10 : 4;
    score += ivPct < 35 ? 18 : ivPct < 55 ? 13 : ivPct < 90 ? 8 : 3;
    score += ((type === 'call' && macroDirection === 'bullish') || (type === 'put' && macroDirection === 'bearish')) ? 18 : 0;
    const swingScore = Math.min(100, Math.round(score));
    const grade: ScoredOption['grade'] = swingScore >= 80 ? 'A+' : swingScore >= 65 ? 'A' : swingScore >= 48 ? 'B' : swingScore >= 32 ? 'C' : 'D';
    if (grade === 'D') continue;
    out.push({ contractSymbol: c.contractSymbol, symbol, type, strike: c.strike, expiration: c.expiration, dte, bid, ask, mid, spread, spreadPct, volume, openInterest: oi, iv, ivPct, inTheMoney: c.inTheMoney, moneyness, deltaApprox, expectedMoveByExp, probabilityOtm, entryMid, target1, target2, stopLoss, rrRatio, holdDays, thetaEstDailyPct, swingScore, grade, rationale: `${dte}DTE · IV ${ivPct}% · OI ${oi.toLocaleString()} · ${spreadPct.toFixed(1)}% spread` });
  }
  return out.sort((a, b) => b.swingScore - a.swingScore).slice(0, 10);
}

// ─── Sectors ──────────────────────────────────────────────────────────────────

const SECTORS = [
  { name: 'Technology', etf: 'XLK' }, { name: 'Financials', etf: 'XLF' },
  { name: 'Energy', etf: 'XLE' }, { name: 'Healthcare', etf: 'XLV' },
  { name: 'Industrials', etf: 'XLI' }, { name: 'Consumer Staples', etf: 'XLP' },
  { name: 'Consumer Discret.', etf: 'XLY' }, { name: 'Utilities', etf: 'XLU' },
  { name: 'Materials', etf: 'XLB' }, { name: 'Real Estate', etf: 'XLRE' },
  { name: 'Comm. Services', etf: 'XLC' },
] as const;

// ─── Scanner types ────────────────────────────────────────────────────────────

export type SetupCategory = 'bullish' | 'bearish' | 'breakout' | 'pullback-fvg' | 'high-conviction' | 'avoid';

export interface ScanResult {
  symbol: string; price: number; changePct: number; volume: number;
  weeklyBias: BiasResult; dailyBias: BiasResult;
  fvgLevels: FVGLevel[]; structureEvents: StructureEvent[];
  relStrengthVsSPY: number; relStrengthVsQQQ: number; volumeRatio: number;
  confidenceScore: number; setupTypes: SetupCategory[];
  bestCall?: ScoredOption; bestPut?: ScoredOption;
  reason: string; invalidation: string; riskWarning: string;
  discovered: boolean;
}

// ─── Scanner text generators ──────────────────────────────────────────────────

function generateReason(dailyBias: BiasResult, weeklyBias: BiasResult, fvgs: FVGLevel[], structure: StructureEvent[], rs: number, price: number): string {
  const parts: string[] = [];
  if (dailyBias.bias === weeklyBias.bias && dailyBias.bias !== 'neutral')
    parts.push(`${dailyBias.bias.toUpperCase()} on weekly + daily`);
  else parts.push(`Daily ${dailyBias.bias} / Weekly ${weeklyBias.bias}`);
  const majEvent = structure.find(e => e.significance === 'major');
  if (majEvent) parts.push(majEvent.description);
  const nearFVG = fvgs.find(f => Math.abs(price - f.mid) / price < 0.05);
  if (nearFVG) parts.push(`${nearFVG.strength} ${nearFVG.type} FVG @ $${nearFVG.mid.toFixed(2)} (${nearFVG.timeframe})`);
  if (Math.abs(rs) > 0.8) parts.push(`${rs > 0 ? '+' : ''}${rs.toFixed(1)}% vs SPY`);
  return parts.join(' · ') || 'Multi-timeframe analysis';
}

function generateInvalidation(dailyBias: BiasResult): string {
  if (dailyBias.bias === 'bullish')
    return dailyBias.ema21 != null ? `Daily close below EMA21 ($${dailyBias.ema21.toFixed(2)}) invalidates the setup.` : 'Loss of daily bullish structure invalidates.';
  if (dailyBias.bias === 'bearish')
    return dailyBias.ema21 != null ? `Daily close above EMA21 ($${dailyBias.ema21.toFixed(2)}) invalidates the setup.` : 'Reclaim of daily structure invalidates.';
  return 'Wait for clearer directional structure before entering.';
}

function generateRiskWarning(vixPrice: number, dailyBias: BiasResult): string {
  if (vixPrice > 28) return 'Elevated VIX — use spreads to cap risk. Wide expected moves. Size down.';
  if (dailyBias.rsi > 76) return 'RSI overbought — pullback risk elevated. Consider waiting for reset.';
  if (dailyBias.rsi < 24) return 'RSI oversold — counter-rally risk on puts. Use tight stops.';
  return 'Define risk before entry. Max 1–2% portfolio per trade. Close before 7 DTE.';
}

// ─── Symbol scan scorer ───────────────────────────────────────────────────────

function computeSymbolScore(
  price: number, changePct: number, spyChangePct: number, qqqChangePct: number,
  weeklyBias: BiasResult, dailyBias: BiasResult,
  fvgs: FVGLevel[], structure: StructureEvent[], vixPrice: number,
): { score: number; setupTypes: SetupCategory[]; reason: string; invalidation: string; riskWarning: string } {
  const rs = r2(changePct - spyChangePct);
  let score = 50;

  // Trend alignment
  if (dailyBias.bias === weeklyBias.bias && dailyBias.bias !== 'neutral') score += 18;
  else if (dailyBias.bias !== 'neutral' && weeklyBias.bias !== 'neutral' && dailyBias.bias !== weeklyBias.bias) score -= 12;
  else if (dailyBias.bias !== 'neutral') score += 5;

  // EMA structure
  const emaOk = dailyBias.bias === 'bullish'
    ? (dailyBias.priceVsEma21 === 'above' && dailyBias.ema9AboveEma21)
    : (dailyBias.priceVsEma21 === 'below' && !dailyBias.ema9AboveEma21);
  score += emaOk ? 8 : -3;

  // RSI quality
  const rsi = dailyBias.rsi;
  if ((dailyBias.bias === 'bullish' && rsi >= 52 && rsi <= 68) || (dailyBias.bias === 'bearish' && rsi <= 48 && rsi >= 32)) score += 8;
  else if (rsi > 78 || rsi < 22) score -= 8;
  else if (rsi > 72 || rsi < 28) score -= 3;

  // Structure events
  if (structure.some(e => e.significance === 'major')) score += 14;
  else if (structure.some(e => e.significance === 'minor')) score += 6;

  // FVG proximity
  const nearFVGs = fvgs.filter(f => Math.abs(price - f.mid) / price < 0.06);
  if (nearFVGs.some(f => f.strength === 'strong')) score += 10;
  else if (nearFVGs.some(f => f.strength === 'moderate')) score += 5;
  else if (nearFVGs.length > 0) score += 2;

  // Relative strength
  if (Math.abs(rs) > 2) score += 8;
  else if (Math.abs(rs) > 0.8) score += 4;
  else score -= 2;

  // VIX environment
  if (vixPrice < 17) score += 6;
  else if (vixPrice < 22) score += 2;
  else if (vixPrice > 28) score -= 8;
  else if (vixPrice > 24) score -= 4;

  score = Math.min(96, Math.max(15, Math.round(score)));

  const setupTypes: SetupCategory[] = [];
  const bullMatch = dailyBias.bias === 'bullish' && weeklyBias.bias === 'bullish';
  const bearMatch = dailyBias.bias === 'bearish' && weeklyBias.bias === 'bearish';
  const bullBOS   = structure.some(e => e.event === 'BOS_UP' || e.event === 'CHoCH_UP');
  const bearBOS   = structure.some(e => e.event === 'BOS_DOWN' || e.event === 'CHoCH_DOWN');
  const bullFVGNear = fvgs.some(f => f.type === 'bullish' && price > f.mid && (price - f.mid) / price < 0.06);

  if (score >= 60 && bullMatch) setupTypes.push('bullish');
  if (score >= 60 && bearMatch) setupTypes.push('bearish');
  if (bullBOS && dailyBias.bias !== 'bearish' && score >= 50) setupTypes.push('breakout');
  if (bearBOS && dailyBias.bias !== 'bullish' && score >= 50) setupTypes.push('breakout');
  if (bullFVGNear && score >= 45) setupTypes.push('pullback-fvg');
  if (setupTypes.length === 0 || score < 40) setupTypes.push('avoid');

  return {
    score, setupTypes,
    reason: generateReason(dailyBias, weeklyBias, fvgs, structure, rs, price),
    invalidation: generateInvalidation(dailyBias),
    riskWarning: generateRiskWarning(vixPrice, dailyBias),
  };
}

// ─── Dynamic discovery ────────────────────────────────────────────────────────

async function fetchDynamicDiscovery(existingSet: Set<string>): Promise<string[]> {
  try {
    const res = await fetch(
      'https://query2.finance.yahoo.com/v1/finance/trending/US?count=20&lang=en-US',
      { headers: YF_HEADERS, cache: 'no-store' }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return ((json?.finance?.result?.[0]?.quotes ?? []) as { symbol: string }[])
      .map(q => q.symbol)
      .filter(s => !existingSet.has(s) && !s.includes('^') && !s.includes('=') && !s.includes('.'))
      .slice(0, 8);
  } catch { return []; }
}

// ─── Watchlists ───────────────────────────────────────────────────────────────

const SCAN_WATCHLIST = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META', 'AMZN',
  'GOOGL', 'TSLA', 'NFLX', 'AVGO', 'SMCI', 'PLTR', 'COIN', 'MSTR', 'SHOP', 'NOW',
  'CRM', 'JPM', 'BAC', 'XLF', 'XLK', 'XLE', 'XLY', 'XLV',
];

// ─── Market Scanner handler ───────────────────────────────────────────────────

async function runMarketScan() {
  const sectorEtfs = SECTORS.map(s => s.etf);
  const allStockSymbols = [...new Set([...SCAN_WATCHLIST, ...sectorEtfs])];

  // Phase 1: macro + quotes + SPY candles + discovery (parallel)
  const [quotes, spyDaily, spyWeekly, discoveredRaw, vixQ] = await Promise.all([
    fetchMultiQuote(allStockSymbols),
    fetchCandles('SPY', '1d', '3mo'),
    fetchCandles('SPY', '1wk', '1y'),
    fetchDynamicDiscovery(new Set(SCAN_WATCHLIST)),
    fetchQuote('^VIX'),
  ]);

  const vixPrice = vixQ?.price ?? 18;
  const spyChangePct = quotes.get('SPY')?.changePct ?? 0;
  const qqqChangePct = quotes.get('QQQ')?.changePct ?? 0;

  // Phase 2: daily candles for all scan symbols + discovered (parallel)
  const allScanSymbols = [...new Set([...SCAN_WATCHLIST, ...discoveredRaw])];
  const candlePairs = await Promise.all(
    allScanSymbols.map(s => fetchCandles(s, '1d', '3mo').then(c => [s, c] as [string, CandleData[]]))
  );
  const candleMap = new Map(candlePairs);

  // Phase 3: compute analysis for each symbol
  const results: ScanResult[] = [];
  for (const symbol of allScanSymbols) {
    const daily = candleMap.get(symbol) ?? [];
    if (daily.length < 22) continue;
    const quote = quotes.get(symbol);
    const price = quote?.price ?? daily[daily.length - 1]?.close ?? 0;
    if (price <= 0) continue;

    const dailyBias   = computeBias(daily);
    const weeklyBias  = computeWeeklyBiasFromDaily(daily);
    const fvgs        = detectFVGs(daily, symbol, 'daily');
    const structure   = detectStructure(daily, symbol, 'daily');
    const changePct   = quote?.changePct ?? 0;
    const volume      = quote?.volume ?? 0;
    const avgVol      = daily.slice(-21, -1).reduce((s, c) => s + c.volume, 0) / 20;
    const volumeRatio = avgVol > 0 ? r2(volume / avgVol) : 1;
    const rsVsSPY     = r2(changePct - spyChangePct);
    const rsVsQQQ     = r2(changePct - qqqChangePct);

    const { score, setupTypes, reason, invalidation, riskWarning } = computeSymbolScore(
      price, changePct, spyChangePct, qqqChangePct, weeklyBias, dailyBias, fvgs, structure, vixPrice
    );

    results.push({
      symbol, price, changePct, volume, weeklyBias, dailyBias,
      fvgLevels: fvgs, structureEvents: structure,
      relStrengthVsSPY: rsVsSPY, relStrengthVsQQQ: rsVsQQQ, volumeRatio,
      confidenceScore: score, setupTypes, reason, invalidation, riskWarning,
      discovered: discoveredRaw.includes(symbol),
    });
  }

  results.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Phase 4: fetch options for top 8 non-avoid symbols
  const optionCandidates = results
    .filter(r => !r.setupTypes.every(t => t === 'avoid'))
    .slice(0, 8)
    .map(r => r.symbol);

  const optionsResults = await Promise.all(
    optionCandidates.map(async (symbol) => {
      const r = results.find(res => res.symbol === symbol)!;
      const macroDir: 'bullish' | 'bearish' = r.dailyBias.bias === 'bearish' ? 'bearish' : 'bullish';
      const chain = await fetchOptionsChain(symbol);
      const nowSec = Math.floor(Date.now() / 1000);
      let allCalls = [...chain.calls], allPuts = [...chain.puts];
      const extra = chain.expirationDates
        .filter(d => { const dte = Math.floor((d - nowSec) / 86400); return dte >= 14 && dte <= 60; })
        .slice(0, 2);
      if (extra.length > 0 && allCalls.length < 10) {
        const extras = await Promise.all(extra.map(e => fetchExpiry(symbol, e)));
        for (const ex of extras) { allCalls = [...allCalls, ...ex.calls]; allPuts = [...allPuts, ...ex.puts]; }
      }
      const uniqCalls = Array.from(new Map(allCalls.map(c => [c.contractSymbol, c])).values());
      const uniqPuts  = Array.from(new Map(allPuts.map(c  => [c.contractSymbol, c])).values());
      return {
        symbol,
        bestCall: scoreContracts(uniqCalls, 'call', symbol, r.price, macroDir)[0],
        bestPut:  scoreContracts(uniqPuts,  'put',  symbol, r.price, macroDir)[0],
      };
    })
  );

  for (const { symbol, bestCall, bestPut } of optionsResults) {
    const r = results.find(res => res.symbol === symbol);
    if (!r) continue;
    r.bestCall = bestCall;
    r.bestPut  = bestPut;
    const topGrade = (g: string) => g === 'A+' || g === 'A';
    if ((bestCall && topGrade(bestCall.grade)) || (bestPut && topGrade(bestPut.grade)))
      if (!r.setupTypes.includes('high-conviction')) r.setupTypes.push('high-conviction');
  }

  // Phase 5: categorize
  const bullishSetups        = results.filter(r => r.setupTypes.includes('bullish'));
  const bearishSetups        = results.filter(r => r.setupTypes.includes('bearish'));
  const breakoutSetups       = results.filter(r => r.setupTypes.includes('breakout') && !r.setupTypes.includes('bullish') && !r.setupTypes.includes('bearish'));
  const pullbackFVGSetups    = results.filter(r => r.setupTypes.includes('pullback-fvg'));
  const highConvictionOptions = results.filter(r => r.setupTypes.includes('high-conviction'));
  const avoidList            = results.filter(r => r.setupTypes.every(t => t === 'avoid'));
  const top5Today            = results.filter(r => !r.setupTypes.every(t => t === 'avoid')).slice(0, 5);
  const discoveredSymbols    = results.filter(r => r.discovered);

  // Sector rotation
  const sectorRotation = SECTORS.map(s => {
    const q = quotes.get(s.etf);
    const rs = q ? r2(q.changePct - spyChangePct) : 0;
    return { name: s.name, etf: s.etf, changePct1d: q?.changePct ?? 0, relStrength: rs, trend: (q?.changePct ?? 0) > 0.3 ? 'bullish' as const : (q?.changePct ?? 0) < -0.3 ? 'bearish' as const : 'neutral' as const, rank: 0 };
  }).sort((a, b) => b.relStrength - a.relStrength).map((s, i) => ({ ...s, rank: i + 1 }));

  const spyDailyBias   = computeBias(spyDaily);
  const spyWeeklyBias  = computeBias(spyWeekly);
  const macroTrend     = spyDailyBias.bias === 'bullish' && spyWeeklyBias.bias !== 'bearish' ? 'bullish' as const
    : spyDailyBias.bias === 'bearish' && spyWeeklyBias.bias !== 'bullish' ? 'bearish' as const : 'neutral' as const;

  return {
    success: true,
    vixPrice, macroTrend, spyChangePct, qqqChangePct,
    allResults: results, bullishSetups, bearishSetups, breakoutSetups,
    pullbackFVGSetups, highConvictionOptions, avoidList, top5Today, discoveredSymbols,
    sectorRotation, fetchedAt: new Date().toISOString(),
  };
}

// ─── Main GET handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode   = req.nextUrl.searchParams.get('mode');
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'SPY').toUpperCase().trim();

  // ── Scanner mode ──
  if (mode === 'scan') {
    try {
      const data = await runMarketScan();
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Scanner unavailable' }, { status: 503 });
    }
  }

  // ── Single symbol mode ──
  try {
    const sectorEtfs   = SECTORS.map(s => s.etf);
    const quoteSymbols = ['^VIX', 'DX-Y.NYB', '^TNX', 'HYG', 'GLD', 'SPY', 'QQQ', 'IWM', ...sectorEtfs];
    if (!quoteSymbols.includes(symbol)) quoteSymbols.push(symbol);

    const [quotePairs, spyDaily, qqqDaily, spyWeekly, symDaily, symHourly] = await Promise.all([
      Promise.all(quoteSymbols.map(s => fetchQuote(s).then(q => [s, q] as [string, QuoteData | null]))),
      fetchCandles('SPY', '1d', '6mo'),
      fetchCandles('QQQ', '1d', '3mo'),
      fetchCandles('SPY', '1wk', '2y'),
      fetchCandles(symbol, '1d', '6mo'),
      fetchCandles(symbol, '1h', '1mo'),
    ]);

    const quotes = new Map(quotePairs.filter(([, q]) => q != null).map(([s, q]) => [s, q!]));
    const vixQ   = quotes.get('^VIX');
    const dxyQ   = quotes.get('DX-Y.NYB');
    const tnxQ   = quotes.get('^TNX');
    const hygQ   = quotes.get('HYG');
    const gldQ   = quotes.get('GLD');
    const spyQ   = quotes.get('SPY');
    const qqqQ   = quotes.get('QQQ');
    const symbolQ = quotes.get(symbol);
    const vixPrice    = vixQ?.price ?? 18;
    const currentPrice = symbolQ?.price ?? symDaily[symDaily.length - 1]?.close ?? 0;

    const weeklyBias   = computeBias(spyWeekly);
    const dailyBias    = computeBias(spyDaily);
    const fourHCandles = aggregate4H(symHourly);
    const fourHourBias = computeBias(fourHCandles.length >= 22 ? fourHCandles : symDaily.slice(-60));

    const fvgLevels = [
      ...detectFVGs(spyWeekly, 'SPY', 'weekly'),
      ...detectFVGs(spyDaily,  'SPY', 'daily'),
      ...(symbol !== 'SPY' ? detectFVGs(symDaily, symbol, 'daily') : []),
    ];
    const structureEvents = [
      ...detectStructure(spyWeekly, 'SPY', 'weekly'),
      ...detectStructure(spyDaily,  'SPY', 'daily'),
      ...detectStructure(fourHCandles.length >= 15 ? fourHCandles : symDaily.slice(-60), symbol, '4h'),
    ];
    const marketRegime = classifyRegime(spyDaily, spyWeekly, vixPrice);

    const spyChg = spyQ?.changePct ?? 0;
    const sectorRotation = SECTORS.map(s => {
      const q = quotes.get(s.etf);
      const rs = q ? r2(q.changePct - spyChg) : 0;
      return { name: s.name, etf: s.etf, price: q?.price ?? 0, changePct1d: q?.changePct ?? 0, relStrength: rs, trend: (q?.changePct ?? 0) > 0.3 ? 'bullish' as const : (q?.changePct ?? 0) < -0.3 ? 'bearish' as const : 'neutral' as const, rank: 0 };
    }).sort((a, b) => b.relStrength - a.relStrength).map((s, i) => ({ ...s, rank: i + 1 }));

    const primaryChain = await fetchOptionsChain(symbol);
    let allCalls = [...primaryChain.calls], allPuts = [...primaryChain.puts];
    const nowSec  = Math.floor(Date.now() / 1000);
    const toFetch = primaryChain.expirationDates
      .filter(d => { const dte = Math.floor((d - nowSec) / 86400); return dte >= 14 && dte <= 60; })
      .slice(0, 3);
    if (toFetch.length > 0 && allCalls.length < 15) {
      const extras = await Promise.all(toFetch.map(e => fetchExpiry(symbol, e)));
      for (const ex of extras) { allCalls = [...allCalls, ...ex.calls]; allPuts = [...allPuts, ...ex.puts]; }
    }
    const uniqueCalls = Array.from(new Map(allCalls.map(c => [c.contractSymbol, c])).values());
    const uniquePuts  = Array.from(new Map(allPuts.map(c  => [c.contractSymbol, c])).values());
    const macroDir: 'bullish' | 'bearish' = dailyBias.bias === 'bearish' ? 'bearish' : 'bullish';
    const scoredCalls = scoreContracts(uniqueCalls, 'call', symbol, currentPrice, macroDir);
    const scoredPuts  = scoreContracts(uniquePuts,  'put',  symbol, currentPrice, macroDir);

    const vixRegime: 'low' | 'normal' | 'elevated' | 'extreme' = vixPrice < 14 ? 'low' : vixPrice < 20 ? 'normal' : vixPrice < 30 ? 'elevated' : 'extreme';
    const bullSectors = sectorRotation.filter(s => s.trend === 'bullish').length;
    const breadth: 'strong' | 'neutral' | 'weak' = bullSectors >= 7 ? 'strong' : bullSectors >= 4 ? 'neutral' : 'weak';
    const riskOnSignals  = [(hygQ?.changePct ?? 0) > 0, (dxyQ?.changePct ?? 0) < -0.2, vixPrice < 18].filter(Boolean).length;
    const riskOffSignals = [(hygQ?.changePct ?? 0) < -0.5, vixPrice > 25, (dxyQ?.changePct ?? 0) > 0.4].filter(Boolean).length;
    const riskEnv: 'risk-on' | 'risk-off' | 'mixed' = riskOnSignals >= 2 ? 'risk-on' : riskOffSignals >= 2 ? 'risk-off' : 'mixed';
    const macroTrend = weeklyBias.bias === 'bullish' && dailyBias.bias !== 'bearish' ? 'bullish' as const : weeklyBias.bias === 'bearish' && dailyBias.bias !== 'bullish' ? 'bearish' as const : 'neutral' as const;
    const keyRisks: string[] = [];
    if (vixPrice > 25) keyRisks.push(`VIX ${vixPrice.toFixed(1)} — premium elevated, consider spreads`);
    if ((tnxQ?.changePct ?? 0) > 3) keyRisks.push('Yield spike — rate-sensitive sectors under pressure');
    if ((dxyQ?.changePct ?? 0) > 0.5) keyRisks.push('Strong dollar — headwind for risk assets');
    if (breadth === 'weak') keyRisks.push('Narrow breadth — only a few sectors leading');
    if (vixRegime === 'extreme') keyRisks.push('Extreme volatility — avoid premium buying');
    if (keyRisks.length === 0) keyRisks.push('No critical macro risks flagged at current readings');

    let confidence = 50;
    if (weeklyBias.bias === dailyBias.bias && dailyBias.bias !== 'neutral') confidence += 15;
    if (dailyBias.bias === fourHourBias.bias && dailyBias.bias !== 'neutral') confidence += 8;
    if (breadth === 'strong' && macroTrend === 'bullish') confidence += 8;
    if (breadth === 'weak'   && macroTrend === 'bearish') confidence += 8;
    if (vixRegime === 'normal' || vixRegime === 'low') confidence += 5;
    if (structureEvents.some(e => e.significance === 'major')) confidence += 9;
    if (fvgLevels.some(f => f.strength === 'strong')) confidence += 5;
    confidence = Math.min(94, Math.max(28, confidence));

    const highestConviction = [...scoredCalls, ...scoredPuts].sort((a, b) => b.swingScore - a.swingScore)[0] ?? null;
    const ivExpanding = (vixQ?.changePct ?? 0) > 3;

    return NextResponse.json({
      success: true, symbol, currentPrice: r2(currentPrice),
      macroOutlook: {
        trend: macroTrend, riskEnv, vix: r2(vixPrice), vixChange: r2(vixQ?.changePct ?? 0), vixRegime,
        spyAboveEma200: !!(spyQ && dailyBias.ema50 != null && spyQ.price > dailyBias.ema50),
        dxy: r2(dxyQ?.price ?? 0), dxyTrend: (dxyQ?.changePct ?? 0) > 0.2 ? 'rising' as const : (dxyQ?.changePct ?? 0) < -0.2 ? 'falling' as const : 'flat' as const,
        yields: r2(tnxQ?.price ?? 0), yieldsTrend: (tnxQ?.changePct ?? 0) > 2 ? 'rising' as const : (tnxQ?.changePct ?? 0) < -2 ? 'falling' as const : 'flat' as const,
        hyg: r2(hygQ?.changePct ?? 0), gld: r2(gldQ?.changePct ?? 0),
        breadth, fedSentiment: (tnxQ?.price ?? 4.5) > 5.2 ? 'hawkish' as const : (tnxQ?.price ?? 4.5) < 3.2 ? 'dovish' as const : 'neutral' as const,
        summary: macroTrend === 'bullish'
          ? `Weekly structure bullish, breadth ${breadth}. ${riskEnv} environment. VIX ${vixPrice.toFixed(1)} — conditions support swing longs.`
          : macroTrend === 'bearish'
          ? `Macro deteriorating — weekly structure bearish, breadth ${breadth}. VIX ${vixPrice.toFixed(1)}.`
          : `Mixed signals: weekly ${weeklyBias.bias}, daily ${dailyBias.bias}. VIX ${vixPrice.toFixed(1)} · ${riskEnv}. Wait for clearer structure.`,
        keyRisks,
      },
      weeklyBias, dailyBias, fourHourBias, fvgLevels, structureEvents, marketRegime, sectorRotation,
      scoredCalls, scoredPuts, highestConviction, confidenceScore: confidence,
      volatilityData: {
        vix: vixPrice, vixChangePct: r2(vixQ?.changePct ?? 0), ivExpanding, regime: vixRegime,
        thetaFriendly: vixRegime === 'low' || vixRegime === 'normal',
        recommendation: vixRegime === 'extreme' ? 'Extreme IV — avoid buying premium. Sell strangles or wait for vol crush.'
          : vixRegime === 'elevated' ? 'Elevated IV — prefer debit spreads over naked long options.'
          : vixRegime === 'low' ? 'Low IV — premium is cheap. Excellent for buying calls/puts outright.'
          : 'Normal IV — standard premium buying. Target 30–45 DTE.',
      },
      quotes: { spy: spyQ, qqq: qqqQ, iwm: quotes.get('IWM') ?? null, vix: vixQ, dxy: dxyQ, tnx: tnxQ, hyg: hygQ, gld: gldQ },
      fetchedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Swing engine unavailable' }, { status: 503 });
  }
}
