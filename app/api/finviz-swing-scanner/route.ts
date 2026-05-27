import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooCandles } from '@/lib/yahooChart';
import { calcAllIndicators } from '@/lib/clientIndicators';
import type { CandleData } from '@/lib/types';
import type { YFCandle } from '@/lib/yahooChart';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstitutionalSetup {
  rank: number;
  symbol: string;
  company: string;
  sector: string;
  price: number;
  changePct: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  trendAlignment: {
    monthly: { bias: 'bullish' | 'bearish' | 'neutral'; desc: string };
    weekly:  { bias: 'bullish' | 'bearish' | 'neutral'; desc: string };
    daily:   { bias: 'bullish' | 'bearish' | 'neutral'; desc: string };
    h4:      { bias: 'bullish' | 'bearish' | 'neutral'; desc: string };
    h1:      { bias: 'bullish' | 'bearish' | 'neutral'; desc: string };
  };
  recentBOS: string[];
  recentCHoCH: string[];
  fvgLevels: { type: 'bullish' | 'bearish'; high: number; low: number; mid: number }[];
  liquidityZones: number[];
  support: number;
  support2: number;
  resistance: number;
  resistance2: number;
  breakoutLevel: number;
  keltnerAnalysis: string;
  volumeAnalysis: string;
  momentumAnalysis: string;
  structureAnalysis: string;
  idealEntry: string;
  idealStop: number;
  idealTarget: number;
  idealTarget2: number;
  riskReward: string;
  bestContractType: 'calls' | 'puts';
  suggestedDelta: string;
  suggestedDTE: string;
  expectedMovePotential: string;
  riskLevel: 'low' | 'medium' | 'high';
  bullishScore: number;
  bearishScore: number;
  continuationProbability: number;
  rrQuality: number;
  trendStrength: number;
  volatilityQuality: number;
  premiumExpansionPotential: number;
  rsi: number;
  atr: number;
  sma20: number;
  sma50: number;
  sma200: number;
  relVolume: number;
  keltnerUpper: number;
  keltnerMid: number;
  keltnerLower: number;
  keltnerPosition: 'above_upper' | 'near_upper' | 'middle' | 'near_lower' | 'below_lower';
}

export interface ScannerResponse {
  success: boolean;
  error?: string;
  stocksScanned: number;
  macroContext: {
    vix: number;
    spyChangePct: number;
    qqqChangePct: number;
    trend: 'bullish' | 'bearish' | 'neutral';
    riskEnvironment: 'risk-on' | 'risk-off' | 'neutral';
  };
  top3Calls: InstitutionalSetup[];
  top3Puts: InstitutionalSetup[];
  allSetups: InstitutionalSetup[];
  fetchedAt: string;
}

// ─── Module-level cache ───────────────────────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let _cache: { data: ScannerResponse; ts: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

function yfToCandle(c: YFCandle): CandleData {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

function splitCSVRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '', inQ = false;
  for (const ch of row) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

interface FinvizRow {
  symbol: string;
  company: string;
  sector: string;
  price: number;
  changePct: number;
}

function parseFinvizCSV(csv: string): FinvizRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows: FinvizRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/"/g, '').trim(); });
    const price = parseFloat(row['Price'] ?? '0');
    if (!row['Ticker'] || !isFinite(price) || price <= 0) continue;
    const changePct = parseFloat((row['Change'] ?? '0%').replace('%', ''));
    rows.push({
      symbol: row['Ticker'],
      company: row['Company'] ?? '',
      sector: row['Sector'] ?? '',
      price,
      changePct: isFinite(changePct) ? changePct : 0,
    });
  }
  return rows;
}

async function fetchFinvizScreener(filters: string): Promise<FinvizRow[]> {
  const apiKey = process.env.FINVIZ_API_KEY;
  const url = apiKey
    ? `https://elite.finviz.com/export.ashx?v=111&f=${filters}&o=-relativevolume&r=1&auth=${encodeURIComponent(apiKey)}`
    : `https://finviz.com/export.ashx?v=111&f=${filters}&o=-relativevolume&r=1`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*',
      'Referer': 'https://finviz.com/screener.ashx',
    },
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`FINviz returned HTTP ${resp.status}`);
  const text = await resp.text();
  return parseFinvizCSV(text);
}

// ─── Macro fetch ──────────────────────────────────────────────────────────────

interface MacroData {
  vix: number;
  spyChangePct: number;
  qqqChangePct: number;
}

async function fetchMacro(): Promise<MacroData> {
  try {
    const [vixRes, spyRes, qqqRes] = await Promise.allSettled([
      fetchYahooCandles('^VIX', '5d', '1d'),
      fetchYahooCandles('SPY', '5d', '1d'),
      fetchYahooCandles('QQQ', '5d', '1d'),
    ]);
    const vixCandles = vixRes.status === 'fulfilled' ? vixRes.value.candles : [];
    const spyCandles = spyRes.status === 'fulfilled' ? spyRes.value.candles : [];
    const qqqCandles = qqqRes.status === 'fulfilled' ? qqqRes.value.candles : [];

    const vix = vixCandles.length ? vixCandles[vixCandles.length - 1].close : 18;
    const spyChangePct = spyCandles.length >= 2
      ? ((spyCandles[spyCandles.length - 1].close - spyCandles[spyCandles.length - 2].close) / spyCandles[spyCandles.length - 2].close) * 100
      : 0;
    const qqqChangePct = qqqCandles.length >= 2
      ? ((qqqCandles[qqqCandles.length - 1].close - qqqCandles[qqqCandles.length - 2].close) / qqqCandles[qqqCandles.length - 2].close) * 100
      : 0;
    return { vix, spyChangePct: r2(spyChangePct), qqqChangePct: r2(qqqChangePct) };
  } catch {
    return { vix: 18, spyChangePct: 0, qqqChangePct: 0 };
  }
}

// ─── BOS / CHoCH detection ────────────────────────────────────────────────────

function detectSwingHighsLows(candles: CandleData[], lookback = 3): {
  highs: { idx: number; price: number }[];
  lows:  { idx: number; price: number }[];
} {
  const highs: { idx: number; price: number }[] = [];
  const lows:  { idx: number; price: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low  <= c.low)  isLow  = false;
    }
    if (isHigh) highs.push({ idx: i, price: c.high });
    if (isLow)  lows.push({ idx: i, price: c.low });
  }
  return { highs, lows };
}

function detectBOSCHoCH(candles: CandleData[], price: number): {
  recentBOS: string[];
  recentCHoCH: string[];
} {
  const recentBOS: string[] = [];
  const recentCHoCH: string[] = [];
  if (candles.length < 20) return { recentBOS, recentCHoCH };

  const last30 = candles.slice(-30);
  const { highs, lows } = detectSwingHighsLows(last30, 3);

  // Sort by idx descending to find most recent
  const sortedHighs = [...highs].sort((a, b) => b.idx - a.idx);
  const sortedLows  = [...lows].sort((a, b) => b.idx - a.idx);

  // Check for BOS_UP or CHoCH_UP: price broke above most recent swing high in last 15 candles
  const recentSwingHighs = sortedHighs.filter(h => h.idx >= last30.length - 15);
  for (const sh of recentSwingHighs) {
    if (price > sh.price) {
      // CHoCH_UP: if the swing high before this was also lower (lower highs pattern)
      const prevHighs = sortedHighs.filter(h => h.idx < sh.idx);
      const isChoCH = prevHighs.length > 0 && prevHighs[0].price > sh.price;
      if (isChoCH) {
        recentCHoCH.push(`CHoCH ↑ $${sh.price.toFixed(2)} — reversal confirmed, prior downtrend broken`);
      } else {
        recentBOS.push(`BOS ↑ $${sh.price.toFixed(2)} — bullish break, structure confirmed`);
      }
      break;
    }
  }

  // Check for BOS_DOWN or CHoCH_DOWN: price broke below most recent swing low in last 15 candles
  const recentSwingLows = sortedLows.filter(l => l.idx >= last30.length - 15);
  for (const sl of recentSwingLows) {
    if (price < sl.price) {
      const prevLows = sortedLows.filter(l => l.idx < sl.idx);
      const isChoCH = prevLows.length > 0 && prevLows[0].price < sl.price;
      if (isChoCH) {
        recentCHoCH.push(`CHoCH ↓ $${sl.price.toFixed(2)} — potential exhaustion, watch for reversal`);
      } else {
        recentBOS.push(`BOS ↓ $${sl.price.toFixed(2)} — bearish break, structure broken`);
      }
      break;
    }
  }

  return { recentBOS, recentCHoCH };
}

// ─── FVG detection ────────────────────────────────────────────────────────────

function detectFVGs(candles: CandleData[]): { type: 'bullish' | 'bearish'; high: number; low: number; mid: number }[] {
  const fvgs: { type: 'bullish' | 'bearish'; high: number; low: number; mid: number }[] = [];
  const last15 = candles.slice(-15);
  for (let i = 1; i < last15.length - 1; i++) {
    const prev = last15[i - 1];
    const next = last15[i + 1];
    // Bullish FVG: gap up
    if (prev.high < next.low) {
      fvgs.push({ type: 'bullish', high: r2(next.low), low: r2(prev.high), mid: r2((next.low + prev.high) / 2) });
    }
    // Bearish FVG: gap down
    if (prev.low > next.high) {
      fvgs.push({ type: 'bearish', high: r2(prev.low), low: r2(next.high), mid: r2((prev.low + next.high) / 2) });
    }
  }
  return fvgs.slice(-3);
}

// ─── Liquidity zones ──────────────────────────────────────────────────────────

function detectLiquidityZones(candles: CandleData[]): number[] {
  const last30 = candles.slice(-30);
  const zones: number[] = [];
  const threshold = 0.003; // 0.3%

  const highs = last30.map(c => c.high);
  const lows  = last30.map(c => c.low);
  const allLevels = [...highs, ...lows];

  for (let i = 0; i < allLevels.length; i++) {
    const level = allLevels[i];
    const count = allLevels.filter(l => Math.abs(l - level) / level < threshold).length;
    if (count >= 2) {
      // Check we don't already have a similar zone
      if (!zones.some(z => Math.abs(z - level) / level < threshold)) {
        zones.push(r2(level));
      }
    }
  }

  return zones.sort((a, b) => a - b).slice(0, 6);
}

// ─── Multi-timeframe bias ─────────────────────────────────────────────────────

function calcMTFBias(candles: CandleData[], sma200: number): InstitutionalSetup['trendAlignment'] {
  const price = candles[candles.length - 1]?.close ?? 0;

  // Monthly: last 60 candles
  const monthly60 = candles.slice(-60);
  let monthlyBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let monthlyDesc = '';
  if (monthly60.length >= 10) {
    const mStart = monthly60[0].close;
    const mEnd   = monthly60[monthly60.length - 1].close;
    const mPct   = mStart > 0 ? ((mEnd - mStart) / mStart) * 100 : 0;
    // HH/HL check: compare last half vs first half
    const firstHalf  = monthly60.slice(0, Math.floor(monthly60.length / 2));
    const secondHalf = monthly60.slice(Math.floor(monthly60.length / 2));
    const firstHigh  = Math.max(...firstHalf.map(c => c.high));
    const secondHigh = Math.max(...secondHalf.map(c => c.high));
    const firstLow   = Math.min(...firstHalf.map(c => c.low));
    const secondLow  = Math.min(...secondHalf.map(c => c.low));
    const hhhl = secondHigh > firstHigh && secondLow > firstLow;
    const llhl = secondHigh < firstHigh && secondLow < firstLow;
    const aboveSma200 = sma200 > 0 && price > sma200;
    if (mPct > 3 && aboveSma200) { monthlyBias = 'bullish'; }
    else if (mPct < -3 || !aboveSma200) { monthlyBias = 'bearish'; }
    else { monthlyBias = 'neutral'; }
    monthlyDesc = `${hhhl ? 'HH+HL pattern, ' : llhl ? 'LL+LH pattern, ' : ''}${mPct >= 0 ? '+' : ''}${mPct.toFixed(1)}% over window${aboveSma200 ? ' — above SMA200, continuation setup intact' : ' — below SMA200, caution advised'}`;
  }

  // Weekly: last 20 candles
  const weekly20 = candles.slice(-20);
  let weeklyBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let weeklyDesc = '';
  if (weekly20.length >= 5) {
    const wStart = weekly20[0].close;
    const wEnd   = weekly20[weekly20.length - 1].close;
    const wPct   = wStart > 0 ? ((wEnd - wStart) / wStart) * 100 : 0;
    // Simple SMA50 check using last 50 candles
    const sma50Candles = candles.slice(-50);
    const sma50 = sma50Candles.length > 0 ? sma50Candles.reduce((a, c) => a + c.close, 0) / sma50Candles.length : 0;
    const aboveSma50 = sma50 > 0 && price > sma50;
    if (wPct > 2 && aboveSma50) { weeklyBias = 'bullish'; }
    else if (wPct < -2 || !aboveSma50) { weeklyBias = 'bearish'; }
    else { weeklyBias = 'neutral'; }
    weeklyDesc = `${aboveSma50 ? 'Price above SMA50 — ' : 'Price below SMA50 — '}weekly momentum ${wPct >= 0 ? 'strong' : 'weakening'} (${wPct >= 0 ? '+' : ''}${wPct.toFixed(1)}%)`;
  }

  // Daily: last 10 candles
  const daily10 = candles.slice(-10);
  let dailyBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let dailyDesc = '';
  if (daily10.length >= 3) {
    const dStart = daily10[0].close;
    const dEnd   = daily10[daily10.length - 1].close;
    const dPct   = dStart > 0 ? ((dEnd - dStart) / dStart) * 100 : 0;
    const sma20Candles = candles.slice(-20);
    const sma20 = sma20Candles.length > 0 ? sma20Candles.reduce((a, c) => a + c.close, 0) / sma20Candles.length : 0;
    const aboveSma20 = sma20 > 0 && price > sma20;
    if (dPct > 0.5 && aboveSma20) { dailyBias = 'bullish'; }
    else if (dPct < -0.5 || !aboveSma20) { dailyBias = 'bearish'; }
    else { dailyBias = 'neutral'; }
    dailyDesc = `Daily momentum ${dPct >= 0 ? 'positive' : 'negative'} (${dPct >= 0 ? '+' : ''}${dPct.toFixed(1)}%)${aboveSma20 ? ', above SMA20 — trend intact' : ', below SMA20 — caution'}`;
  }

  // 4H: last 5 candles (micro momentum)
  const h4_5 = candles.slice(-5);
  let h4Bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let h4Desc = '';
  if (h4_5.length >= 2) {
    const h4Start = h4_5[0].close;
    const h4End   = h4_5[h4_5.length - 1].close;
    const h4Pct   = h4Start > 0 ? ((h4End - h4Start) / h4Start) * 100 : 0;
    const greenBars = h4_5.filter(c => c.close > c.open).length;
    if (h4Pct > 0.3 && greenBars >= 3) { h4Bias = 'bullish'; }
    else if (h4Pct < -0.3 && greenBars <= 1) { h4Bias = 'bearish'; }
    else { h4Bias = 'neutral'; }
    h4Desc = `Short-term momentum ${h4Pct >= 0 ? 'bullish' : 'bearish'} — ${greenBars}/${h4_5.length} green bars, ${h4Pct >= 0 ? '+' : ''}${h4Pct.toFixed(2)}% last 5 sessions`;
  }

  // 1H: last 2 candles
  const h1_2 = candles.slice(-2);
  let h1Bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let h1Desc = '';
  if (h1_2.length === 2) {
    const pct = h1_2[0].close > 0 ? ((h1_2[1].close - h1_2[0].close) / h1_2[0].close) * 100 : 0;
    const lastGreen = h1_2[1].close > h1_2[1].open;
    if (pct > 0.1 && lastGreen) { h1Bias = 'bullish'; }
    else if (pct < -0.1 && !lastGreen) { h1Bias = 'bearish'; }
    else { h1Bias = 'neutral'; }
    h1Desc = `Last 2 bars: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% — intraday momentum ${h1Bias}`;
  }

  return {
    monthly: { bias: monthlyBias, desc: monthlyDesc },
    weekly:  { bias: weeklyBias,  desc: weeklyDesc },
    daily:   { bias: dailyBias,   desc: dailyDesc },
    h4:      { bias: h4Bias,      desc: h4Desc },
    h1:      { bias: h1Bias,      desc: h1Desc },
  };
}

// ─── Keltner channel position ──────────────────────────────────────────────────

function calcKeltnerPosition(
  price: number,
  keltnerUpper: number,
  keltnerLower: number,
): InstitutionalSetup['keltnerPosition'] {
  const range = keltnerUpper - keltnerLower;
  if (range <= 0) return 'middle';
  const posRatio = (price - keltnerLower) / range;
  if (posRatio > 1) return 'above_upper';
  if (posRatio > 0.75) return 'near_upper';
  if (posRatio > 0.35) return 'middle';
  if (posRatio > 0) return 'near_lower';
  return 'below_lower';
}

// ─── Score computations ───────────────────────────────────────────────────────

interface ScoreInputs {
  price: number;
  sma20: number;
  sma50: number;
  sma200: number;
  rsi: number;
  atr: number;
  relVolume: number;
  keltnerPosition: InstitutionalSetup['keltnerPosition'];
  trendAlignment: InstitutionalSetup['trendAlignment'];
  recentBOS: string[];
  recentCHoCH: string[];
  candles: CandleData[];
}

function calcBullishScore(inp: ScoreInputs): number {
  let score = 0;
  const { price, sma20, sma50, sma200, rsi, relVolume, keltnerPosition, trendAlignment, recentBOS, candles } = inp;

  // Full bull stack
  if (price > sma20 && sma20 > sma50 && sma50 > sma200) score += 2.0;
  // Healthy distance above SMA200
  if (sma200 > 0 && price > sma200 * 1.05 && price < sma200 * 1.3) score += 1.0;
  // MTF alignment
  if (trendAlignment.weekly.bias === 'bullish' && trendAlignment.monthly.bias === 'bullish') score += 1.5;
  // Daily bullish
  if (trendAlignment.daily.bias === 'bullish') score += 1.0;
  // Keltner
  if (keltnerPosition === 'near_upper') score += 1.0;
  // RSI momentum zone
  if (rsi >= 55 && rsi <= 70) score += 0.5;
  // Institutional volume
  if (relVolume > 1.5) score += 1.0;
  // BOS up
  if (recentBOS.some(b => b.includes('↑'))) score += 0.5;
  // 4H bias aligned
  if (trendAlignment.h4.bias === 'bullish') score += 0.5;

  // Check bearish divergence for -deduction
  if (candles.length >= 5) {
    // No deduction for bullish score here
  }

  return Math.min(10.0, Math.round(score * 10) / 10);
}

function calcBearishScore(inp: ScoreInputs): number {
  let score = 0;
  const { price, sma200, rsi, keltnerPosition, recentCHoCH, trendAlignment, candles } = inp;

  // RSI overbought
  if (rsi > 72) score += 2.0;
  // Keltner overextended
  if (keltnerPosition === 'above_upper') score += 1.5;
  // Price extended above SMA200
  if (sma200 > 0 && price > sma200 * 1.3) score += 1.5;
  // Recent 5-day performance parabolic
  const last5 = candles.slice(-6);
  if (last5.length >= 2) {
    const perf5d = last5[0].close > 0 ? ((last5[last5.length - 1].close - last5[0].close) / last5[0].close) * 100 : 0;
    if (perf5d > 12) score += 1.0;
  }
  // CHoCH down
  if (recentCHoCH.some(c => c.includes('↓'))) score += 1.0;
  // RSI divergence: RSI < prior RSI but price higher (last 5 candles)
  if (candles.length >= 5) {
    const last5c = candles.slice(-5);
    const priorClose = last5c[0].close;
    const curClose   = last5c[last5c.length - 1].close;
    // Simple proxy: if price went up but RSI is below 55, possible hidden divergence
    if (curClose > priorClose && rsi < 55) score += 0.5;
  }
  // Volume on up days declining (distribution)
  if (candles.length >= 10) {
    const last10 = candles.slice(-10);
    const greenVol = last10.filter(c => c.close > c.open).reduce((s, c) => s + c.volume, 0);
    const redVol   = last10.filter(c => c.close <= c.open).reduce((s, c) => s + c.volume, 0);
    const greenCnt = last10.filter(c => c.close > c.open).length;
    const redCnt   = last10.filter(c => c.close <= c.open).length;
    if (greenCnt > 0 && redCnt > 0 && (greenVol / greenCnt) < (redVol / redCnt)) score += 1.0;
  }
  // 4H momentum fading
  if (trendAlignment.h4.bias === 'neutral' || trendAlignment.h4.bias === 'bearish') score += 0.5;

  return Math.min(10.0, Math.round(score * 10) / 10);
}

// ─── Narrative generation ─────────────────────────────────────────────────────

function genKeltnerAnalysis(pos: InstitutionalSetup['keltnerPosition']): string {
  switch (pos) {
    case 'above_upper': return 'Price overextended above upper Keltner — parabolic territory, high reversal risk. Avoid new longs, watch for mean-reversion puts.';
    case 'near_upper':  return 'Riding upper Keltner band — trend is hot and institutional. Strong continuation bias as long as price holds above the midline.';
    case 'middle':      return 'Price consolidating at Keltner midline — compression building. Watch for breakout above upper band as entry signal.';
    case 'near_lower':  return 'Approaching lower Keltner — price under pressure. Bulls need to defend this zone or lower Keltner test likely.';
    case 'below_lower': return 'Below lower Keltner — bearish expansion underway. Shorts have momentum; any bounce to midline is a shorting opportunity.';
  }
}

function genVolumeAnalysis(relVolume: number): string {
  const xStr = relVolume.toFixed(1);
  if (relVolume > 2.5) return `Exceptional volume surge ${xStr}x avg — clear institutional accumulation. Premium will expand.`;
  if (relVolume > 1.5) return `Strong relative volume ${xStr}x avg — smart money confirming the move. Volume validates the setup.`;
  if (relVolume >= 1.0) return `Moderate volume ${xStr}x avg — setup valid but not institutional-grade conviction yet. Wait for volume confirmation.`;
  return `Below-average volume ${xStr}x avg — setup lacks institutional conviction. High risk of false break.`;
}

function genMomentumAnalysis(rsi: number): string {
  if (rsi >= 55 && rsi < 68) return 'RSI in the sweet spot — bullish momentum without overbought extension. Prime zone for premium expansion.';
  if (rsi >= 68 && rsi <= 75) return 'RSI elevated but not extreme — momentum is strong. Manage risk carefully as pullback risk increases above 70.';
  if (rsi > 75) return 'RSI overbought — mean reversion risk is real. Premium likely already inflated; consider debit spreads.';
  if (rsi >= 45 && rsi < 55) return 'RSI neutral — no strong directional edge from momentum. Needs catalyst or volume to break out.';
  return 'RSI weakening despite screener qualification — watch for momentum failure. Confirm before entry.';
}

function genStructureAnalysis(
  recentBOS: string[],
  recentCHoCH: string[],
  fvgLevels: { type: 'bullish' | 'bearish'; high: number; low: number; mid: number }[],
  trendAlignment: InstitutionalSetup['trendAlignment'],
): string {
  const hasBullBOS = recentBOS.some(b => b.includes('↑'));
  const hasBullCHoCH = recentCHoCH.some(c => c.includes('↑'));
  const bullFVGs = fvgLevels.filter(f => f.type === 'bullish').length;
  const mtfAligned = trendAlignment.monthly.bias === 'bullish' && trendAlignment.weekly.bias === 'bullish';
  if (hasBullBOS && mtfAligned) {
    return `Clean daily BOS confirmed — higher structure intact. ${bullFVGs} bullish FVG${bullFVGs !== 1 ? 's' : ''} below acting as potential support. Monthly/weekly aligned — institutional continuation setup.`;
  }
  if (hasBullCHoCH) {
    return `CHoCH detected — potential trend reversal in play. ${bullFVGs} bullish FVG${bullFVGs !== 1 ? 's' : ''} identified. Monitor for follow-through above structure.`;
  }
  if (recentBOS.some(b => b.includes('↓'))) {
    return `Bearish BOS detected — structure breaking down. ${fvgLevels.filter(f => f.type === 'bearish').length} bearish FVGs overhead acting as resistance. Caution on longs.`;
  }
  return `Structure neutral — no confirmed BOS/CHoCH. ${fvgLevels.length} FVG${fvgLevels.length !== 1 ? 's' : ''} identified nearby. Wait for structure confirmation before entry.`;
}

// ─── Full per-symbol analysis ─────────────────────────────────────────────────

async function analyzeSymbol(row: FinvizRow): Promise<InstitutionalSetup | null> {
  try {
    const { candles: yfCandles } = await fetchYahooCandles(row.symbol, '1y', '1d');
    if (yfCandles.length < 50) {
      console.error(`[FINviz Swing Scanner] Insufficient candles for ${row.symbol}: ${yfCandles.length}`);
      return null;
    }

    const candles: CandleData[] = yfCandles.map(yfToCandle);
    const { analysis } = calcAllIndicators(candles);

    const closes = candles.map(c => c.close);
    const price  = candles[candles.length - 1].close;

    // SMA200 (simple)
    const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);

    // Keltner Channel
    const ema20       = analysis.ma20;
    const atr         = analysis.atr;
    const keltnerUpper  = ema20 + 2 * atr;
    const keltnerLower  = ema20 - 2 * atr;
    const keltnerMid    = ema20;
    const keltnerPosition = calcKeltnerPosition(price, keltnerUpper, keltnerLower);

    // Relative volume
    const last5Vols = candles.slice(-5).map(c => c.volume);
    const last20Vols = candles.slice(-20).map(c => c.volume);
    const last5avgVol = last5Vols.reduce((a, b) => a + b, 0) / last5Vols.length;
    const avgVol20    = last20Vols.reduce((a, b) => a + b, 0) / last20Vols.length;
    const relVolume   = avgVol20 > 0 ? r2(last5avgVol / avgVol20) : 1;

    // Support/Resistance from recent candles
    const recent50 = candles.slice(-50);
    const recent20 = candles.slice(-20);
    const recent40 = candles.slice(-40);
    const support    = Math.min(...recent20.map(c => c.low));
    const resistance = Math.max(...recent20.map(c => c.high));
    const support2   = Math.min(...recent40.slice(0, 20).map(c => c.low));
    const resistance2 = Math.max(...recent40.slice(0, 20).map(c => c.high));

    // BOS / CHoCH
    const { recentBOS, recentCHoCH } = detectBOSCHoCH(candles, price);

    // FVGs
    const fvgLevels = detectFVGs(candles);

    // Liquidity zones
    const liquidityZones = detectLiquidityZones(candles.slice(-30));

    // Multi-timeframe bias
    const trendAlignment = calcMTFBias(candles, sma200);

    // Scores
    const sma20 = analysis.ma20;
    const sma50 = analysis.ma50;
    const rsi   = analysis.rsi;

    const scoreInputs: ScoreInputs = {
      price, sma20, sma50, sma200: r2(sma200), rsi, atr,
      relVolume, keltnerPosition, trendAlignment, recentBOS, recentCHoCH, candles,
    };

    const bullishScore = calcBullishScore(scoreInputs);
    const bearishScore = calcBearishScore(scoreInputs);

    // Continuation probability
    const continuationProbability = Math.min(92, Math.round(30 + bullishScore * 6));

    // R:R Quality
    const target = resistance + 0.5 * atr;
    const stop   = sma20 - 0.25 * atr;
    const rrRatio = (price - stop) > 0 ? (target - price) / (price - stop) : 1;
    const rrQuality = Math.min(10, Math.max(1, Math.round(rrRatio * 2.5)));

    // Trend strength (0-100 → 1-10)
    const trendStrength = Math.max(1, Math.min(10, Math.round(analysis.trendStrength / 10)));

    // Volatility quality
    const atrRatio = price > 0 ? (atr / price) * 100 : 0;
    let volatilityQuality: number;
    if (atrRatio < 0.5) volatilityQuality = 2;
    else if (atrRatio >= 0.5 && atrRatio < 1.5) volatilityQuality = 5;
    else if (atrRatio >= 1.5 && atrRatio <= 4.0) volatilityQuality = 9;
    else if (atrRatio > 4.0 && atrRatio <= 6.0) volatilityQuality = 6;
    else volatilityQuality = 3;

    // Premium expansion potential
    const premiumExpansionPotential = Math.min(10, Math.round((bullishScore + relVolume * 0.5 + volatilityQuality * 0.3) / 2.1));

    // Narratives
    const keltnerAnalysis  = genKeltnerAnalysis(keltnerPosition);
    const volumeAnalysis   = genVolumeAnalysis(relVolume);
    const momentumAnalysis = genMomentumAnalysis(rsi);
    const structureAnalysis = genStructureAnalysis(recentBOS, recentCHoCH, fvgLevels, trendAlignment);

    // Entry / Stop / Target
    const distToSma20 = price > 0 ? Math.abs(price - sma20) / price : 1;
    let idealEntry: string;
    if (distToSma20 <= 0.01) {
      idealEntry = `Pullback to SMA20 ($${sma20.toFixed(2)}) — ideal reclaim entry`;
    } else if (keltnerPosition === 'near_upper') {
      idealEntry = `Breakout continuation above $${r2(resistance).toFixed(2)} resistance`;
    } else {
      idealEntry = `Wait for pullback to $${sma20.toFixed(2)} SMA20 zone`;
    }
    const idealStop    = r2(sma20 - 0.5 * atr);
    const idealTarget  = r2(resistance + atr);
    const idealTarget2 = r2(resistance + 2 * atr);
    const entryForRR   = price;
    const riskAmt      = entryForRR - idealStop;
    const rewardAmt    = idealTarget - entryForRR;
    const rrNum        = riskAmt > 0 ? rewardAmt / riskAmt : 0;
    const riskReward   = `${rrNum.toFixed(1)}:1 R/R`;

    // Options guidance
    const bestContractType: 'calls' | 'puts' = bullishScore >= bearishScore ? 'calls' : 'puts';
    const highConfidence = Math.max(bullishScore, bearishScore) >= 7;
    const suggestedDelta = highConfidence ? '0.40–0.55' : '0.30–0.45';
    const suggestedDTE   = trendAlignment.weekly.bias === 'bullish' ? '21–35 DTE' : '35–50 DTE';
    const expectedMovePotential = `${(atr / price * 100 * 3).toFixed(1)}%`;
    const riskLevel: 'low' | 'medium' | 'high' = bullishScore >= 7 && rsi < 70 ? 'low' : bullishScore >= 5 ? 'medium' : 'high';

    // Bias
    let bias: 'bullish' | 'bearish' | 'neutral';
    if (bullishScore - bearishScore >= 2) bias = 'bullish';
    else if (bearishScore - bullishScore >= 2) bias = 'bearish';
    else bias = 'neutral';

    const confidence = Math.round(Math.max(bullishScore, bearishScore) * 10);

    // Breakout level
    const breakoutLevel = r2(resistance * 1.002);

    return {
      rank: 0, // set later
      symbol: row.symbol,
      company: row.company,
      sector: row.sector,
      price: r2(row.price || price),
      changePct: r2(row.changePct),
      bias,
      confidence,
      trendAlignment,
      recentBOS,
      recentCHoCH,
      fvgLevels,
      liquidityZones,
      support: r2(support),
      support2: r2(support2),
      resistance: r2(resistance),
      resistance2: r2(resistance2),
      breakoutLevel,
      keltnerAnalysis,
      volumeAnalysis,
      momentumAnalysis,
      structureAnalysis,
      idealEntry,
      idealStop,
      idealTarget,
      idealTarget2,
      riskReward,
      bestContractType,
      suggestedDelta,
      suggestedDTE,
      expectedMovePotential,
      riskLevel,
      bullishScore,
      bearishScore,
      continuationProbability,
      rrQuality,
      trendStrength,
      volatilityQuality,
      premiumExpansionPotential,
      rsi: r1(rsi),
      atr: r2(atr),
      sma20: r2(sma20),
      sma50: r2(sma50),
      sma200: r2(sma200),
      relVolume,
      keltnerUpper: r2(keltnerUpper),
      keltnerMid: r2(keltnerMid),
      keltnerLower: r2(keltnerLower),
      keltnerPosition,
    };
  } catch (err) {
    console.error(`[FINviz Swing Scanner] Failed ${row.symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Batch processing ─────────────────────────────────────────────────────────

async function processBatch<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<InstitutionalSetup | null>,
): Promise<InstitutionalSetup[]> {
  const results: InstitutionalSetup[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
    }
  }
  return results;
}

// ─── Main scan ────────────────────────────────────────────────────────────────

const PRIMARY_FILTERS   = 'sh_price_o10,sh_price_u80,sh_avgvol_o1000,sh_relvol_o1.5,ta_perf_1wup,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa,op_option';
const FALLBACK1_FILTERS = 'sh_price_o10,sh_price_u80,sh_avgvol_o1000,sh_relvol_o1.5,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa,op_option';
const FALLBACK2_FILTERS = 'sh_price_o10,sh_price_u80,sh_avgvol_o1000,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa,op_option';

async function runScan(): Promise<ScannerResponse> {
  // Fetch FINviz screener with fallbacks
  let rows: FinvizRow[] = [];
  try {
    rows = await fetchFinvizScreener(PRIMARY_FILTERS);
  } catch (err) {
    console.error('[FINviz Swing Scanner] Primary filter failed:', err instanceof Error ? err.message : err);
  }

  if (rows.length < 3) {
    try {
      rows = await fetchFinvizScreener(FALLBACK1_FILTERS);
    } catch (err) {
      console.error('[FINviz Swing Scanner] Fallback1 filter failed:', err instanceof Error ? err.message : err);
    }
  }

  if (rows.length < 3) {
    try {
      rows = await fetchFinvizScreener(FALLBACK2_FILTERS);
    } catch (err) {
      console.error('[FINviz Swing Scanner] Fallback2 filter failed:', err instanceof Error ? err.message : err);
    }
  }

  if (rows.length === 0) {
    return {
      success: false,
      error: 'FINviz screener returned no results. Market may be closed or FINviz is unavailable.',
      stocksScanned: 0,
      macroContext: { vix: 18, spyChangePct: 0, qqqChangePct: 0, trend: 'neutral', riskEnvironment: 'neutral' },
      top3Calls: [],
      top3Puts: [],
      allSetups: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const tickers = rows.slice(0, 20);

  // Fetch macro data in parallel with ticker processing
  const [macro, setups] = await Promise.all([
    fetchMacro(),
    processBatch(tickers, 4, analyzeSymbol),
  ]);

  if (setups.length === 0) {
    return {
      success: false,
      error: 'Could not analyze any symbols — Yahoo Finance may be unavailable.',
      stocksScanned: tickers.length,
      macroContext: { vix: macro.vix, spyChangePct: macro.spyChangePct, qqqChangePct: macro.qqqChangePct, trend: 'neutral', riskEnvironment: 'neutral' },
      top3Calls: [],
      top3Puts: [],
      allSetups: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  // Macro trend
  const macroTrend: 'bullish' | 'bearish' | 'neutral' =
    macro.spyChangePct > 0.3 && macro.qqqChangePct > 0.3 ? 'bullish'
    : macro.spyChangePct < -0.3 && macro.qqqChangePct < -0.3 ? 'bearish'
    : 'neutral';
  const riskEnvironment: 'risk-on' | 'risk-off' | 'neutral' =
    macro.vix < 15 && macroTrend === 'bullish' ? 'risk-on'
    : macro.vix > 20 || macroTrend === 'bearish' ? 'risk-off'
    : 'neutral';

  // Sort allSetups by max(bullish, bearish) DESC
  const allSetups = setups
    .sort((a, b) => Math.max(b.bullishScore, b.bearishScore) - Math.max(a.bullishScore, a.bearishScore))
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const top3Calls = [...allSetups].sort((a, b) => b.bullishScore - a.bullishScore).slice(0, 3);
  const top3Puts  = [...allSetups].sort((a, b) => b.bearishScore - a.bearishScore).slice(0, 3);

  return {
    success: true,
    stocksScanned: tickers.length,
    macroContext: {
      vix: r2(macro.vix),
      spyChangePct: macro.spyChangePct,
      qqqChangePct: macro.qqqChangePct,
      trend: macroTrend,
      riskEnvironment,
    },
    top3Calls,
    top3Puts,
    allSetups,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const bust = req.nextUrl.searchParams.get('bust') === '1';

  if (!bust && _cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const result = await runScan();
    if (result.success) {
      _cache = { data: result, ts: Date.now() };
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[FINviz Swing Scanner] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Scanner unavailable', stocksScanned: 0, macroContext: { vix: 18, spyChangePct: 0, qqqChangePct: 0, trend: 'neutral', riskEnvironment: 'neutral' }, top3Calls: [], top3Puts: [], allSetups: [], fetchedAt: new Date().toISOString() } satisfies ScannerResponse,
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
