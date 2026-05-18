import { NextResponse } from 'next/server';

// ─── ET timezone ──────────────────────────────────────────────────────────────

function getETOffsetHours(): number {
  const now = new Date();
  const year = now.getFullYear();
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, mar1Day === 0 ? 8 : 15 - mar1Day);
  const nov1Day = new Date(year, 10, 1).getDay();
  const dstEnd = new Date(year, 10, nov1Day === 0 ? 1 : 8 - nov1Day);
  return now >= dstStart && now < dstEnd ? -4 : -5;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface QuoteResult {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume3Month: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  postMarketTime?: number;
  bid?: number;
  ask?: number;
}

interface KeyLevels {
  ahHigh: number | null;
  ahLow: number | null;
  regularClose: number;
  vwap: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
}

interface ScalpSetup {
  entry: string;
  stop: string;
  tp1: number | null;
  tp2: number | null;
  runner: number | null;
}

interface TickerAnalysis {
  symbol: string;
  shortName: string;
  currentPrice: number;
  regularClose: number;
  ahChange: number;
  ahChangePct: number;
  ahHigh: number | null;
  ahLow: number | null;
  ahRange: number | null;
  vwap: number | null;
  bid: number;
  ask: number;
  spread: number;
  spreadPct: number;
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS';
  trend: string;
  momentumScore: number;
  grade: 'A' | 'B' | 'C' | 'D';
  setupQuality: string;
  rsVsQQQ: string;
  rsVsQQQPct: number;
  ahVolume: number;
  avgDailyVolume: number;
  volSurge: number;
  keyLevels: KeyLevels;
  longSetup: ScalpSetup;
  shortSetup: ScalpSetup;
  preferredDirection: 'long' | 'short' | 'neutral';
  confirmationLogic: string;
  riskWarnings: string[];
  candleCount: number;
  rankScore: number;
  lastAHTradeTime: string | null;
  dataSource: string;
}

// ─── Symbols ──────────────────────────────────────────────────────────────────

const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'META', 'AMD', 'MSFT', 'TQQQ', 'SQQQ', 'IWM', 'PLTR', 'AMZN', 'SOFI'];
const ETF_SYMBOLS = new Set(['SPY', 'QQQ', 'TQQQ', 'SQQQ', 'IWM']);

// ─── Yahoo Finance v8 chart — same pattern as working ORB/power-hour routes ──

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

// Single request per symbol: returns both quote meta AND 1-min candles for today.
// Uses range=1d (not period1/period2) so it works regardless of time of day.
async function fetchSymbolData(
  symbol: string,
  ahStartSec: number,
  ahEndSec: number,
  nowSec: number,
): Promise<{ quote: QuoteResult; candles: Candle[] }> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=1d&interval=1m&includePrePost=true`;

  const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${symbol}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`Yahoo Finance returned HTML for ${symbol} — rate limited`);

  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? `No chart data for ${symbol}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: Record<string, any> = result.meta ?? {};

  // Extract quote data from chart meta (v8 meta has postMarket fields)
  const regularClose = round2(meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0);
  const postPrice    = meta.postMarketPrice != null ? round2(meta.postMarketPrice) : undefined;
  const postChange   = postPrice != null ? round2(postPrice - regularClose) : undefined;
  const postChangePct = postPrice != null && regularClose > 0
    ? round2(((postPrice - regularClose) / regularClose) * 100)
    : undefined;

  const quote: QuoteResult = {
    symbol,
    shortName:                  meta.shortName ?? meta.longName ?? symbol,
    regularMarketPrice:         regularClose,
    regularMarketChange:        round2(meta.regularMarketChange ?? 0),
    regularMarketChangePercent: round2(meta.regularMarketChangePercent ?? 0),
    regularMarketVolume:        meta.regularMarketVolume ?? 0,
    // v8 chart meta doesn't carry 3-month avg; use today's vol as stand-in
    averageDailyVolume3Month:   meta.regularMarketVolume ?? 0,
    regularMarketDayHigh:       round2(meta.regularMarketDayHigh ?? 0),
    regularMarketDayLow:        round2(meta.regularMarketDayLow ?? 0),
    postMarketPrice:            postPrice,
    postMarketChange:           postChange,
    postMarketChangePercent:    postChangePct,
    postMarketTime:             meta.postMarketTime,
    // v8 chart meta rarely carries bid/ask; default to 0 (spread shown as N/A)
    bid:  meta.bid  ?? 0,
    ask:  meta.ask  ?? 0,
  };

  // Extract 1-min candles and filter to AH window only
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const windowEnd = Math.min(nowSec, ahEndSec);

  const candles: Candle[] = timestamps
    .map((ts, i) => ({
      time:   ts,
      open:   q.open?.[i]   ?? 0,
      high:   q.high?.[i]   ?? 0,
      low:    q.low?.[i]    ?? 0,
      close:  q.close?.[i]  ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter(c => c.close > 0 && c.high > 0 && c.time >= ahStartSec && c.time <= windowEnd);

  return { quote, candles };
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function calcLiquidity(spreadPct: number, isEtf: boolean): 'SAFE' | 'MODERATE' | 'DANGEROUS' {
  if (spreadPct === 0) return 'MODERATE'; // no bid/ask data
  if (isEtf) return spreadPct < 0.03 ? 'SAFE' : spreadPct < 0.20 ? 'MODERATE' : 'DANGEROUS';
  return spreadPct < 0.05 ? 'SAFE' : spreadPct < 0.20 ? 'MODERATE' : 'DANGEROUS';
}

function calcVwap(candles: Candle[]): number | null {
  if (!candles.length) return null;
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    cumTPV += ((c.high + c.low + c.close) / 3) * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

function calcTrend(candles: Candle[], ahChangePct: number, vwap: number | null): string {
  if (Math.abs(ahChangePct) < 0.3) return 'Range chop';

  const last5 = candles.slice(-5);
  const bullLast5 = last5.filter(c => c.close >= c.open).length;
  const bearLast5 = last5.length - bullLast5;

  if (ahChangePct > 1.5 && bearLast5 >= 3) return 'Exhaustion move';

  if (vwap !== null && candles.length >= 3) {
    const recent3 = candles.slice(-3);
    const recentUp   = recent3.every(c => c.close >= c.open);
    const recentDown = recent3.every(c => c.close  < c.open);
    if (ahChangePct > 0 && recentDown) return 'Reversal setup';
    if (ahChangePct < 0 && recentUp)   return 'Reversal setup';
  }

  if (bullLast5 >= 4 && ahChangePct > 0) return 'Bullish continuation';
  if (bearLast5 >= 4 && ahChangePct < 0) return 'Bearish continuation';
  return ahChangePct > 0 ? 'Bullish continuation' : 'Bearish continuation';
}

function calcMomentumScore(
  ahChangePct: number,
  ahVolume: number,
  regularVolume: number,
  candles: Candle[],
  trend: string,
): number {
  let score = 0;

  const absChg = Math.abs(ahChangePct);
  if (absChg > 3)        score += 3;
  else if (absChg > 2)   score += 2.5;
  else if (absChg > 1)   score += 2;
  else if (absChg > 0.5) score += 1.5;
  else if (absChg > 0.2) score += 1;
  else                   score += 0.3;

  // AH volume vs ~5% of the day's regular volume
  const ahExpected = regularVolume * 0.05;
  const volSurge   = ahExpected > 0 ? ahVolume / ahExpected : 0;
  if (volSurge > 5)        score += 3;
  else if (volSurge > 3)   score += 2.5;
  else if (volSurge > 2)   score += 2;
  else if (volSurge > 1.5) score += 1.5;
  else if (volSurge > 1)   score += 1;
  else                     score += 0.3;

  const last8 = candles.slice(-8);
  if (last8.length > 0) {
    const bullPct  = last8.filter(c => c.close >= c.open).length / last8.length;
    const isBull   = trend.toLowerCase().includes('bullish') || trend === 'Exhaustion move';
    const consist  = isBull ? bullPct : 1 - bullPct;
    if (consist > 0.85)      score += 2;
    else if (consist > 0.70) score += 1.5;
    else if (consist > 0.55) score += 1;
    else                     score += 0.3;
  } else {
    score += 0.3;
  }

  const last5 = candles.slice(-5);
  if (last5.length >= 2) {
    const recentMove = Math.abs((last5[last5.length - 1].close - last5[0].open) / last5[0].open * 100);
    if (recentMove > 0.5)       score += 2;
    else if (recentMove > 0.3)  score += 1.5;
    else if (recentMove > 0.15) score += 1;
    else                        score += 0.3;
  } else {
    score += 0.3;
  }

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

function calcGrade(score: number, liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS'): 'A' | 'B' | 'C' | 'D' {
  if (score >= 8 && liquidity !== 'DANGEROUS') return 'A';
  if (score >= 6.5) return 'B';
  if (score >= 5)   return 'C';
  return 'D';
}

function calcRankScore(
  score: number,
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS',
  grade: 'A' | 'B' | 'C' | 'D',
  ahChangePct: number,
): number {
  const liqScore   = liquidity === 'SAFE' ? 10 : liquidity === 'MODERATE' ? 6 : 2;
  const gradeScore = grade === 'A' ? 10 : grade === 'B' ? 7 : grade === 'C' ? 5 : 2;
  return round2(score * 0.40 + liqScore * 0.20 + gradeScore * 0.25 + Math.min(10, Math.abs(ahChangePct)) * 0.15);
}

function buildRiskWarnings(
  spreadPct: number,
  ahChangePct: number,
  trend: string,
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS',
  candles: Candle[],
): string[] {
  const w: string[] = [];
  if (spreadPct > 0.15 && spreadPct > 0) w.push('Spread widening — execution risk elevated');
  if (Math.abs(ahChangePct) > 5)         w.push('Extended move — exhaustion/fade risk; avoid chasing');
  if (trend === 'Range chop')            w.push('Low momentum — chop conditions likely');
  if (trend === 'Exhaustion move')       w.push('Exhaustion detected — reversal risk is high');
  if (candles.length >= 6) {
    const last3 = candles.slice(-3).reduce((s, c) => s + c.volume, 0);
    const prev3 = candles.slice(-6, -3).reduce((s, c) => s + c.volume, 0);
    if (last3 < prev3) w.push('Volume collapsing — momentum fading');
  }
  if (liquidity === 'DANGEROUS') w.push('DANGEROUS spread — skip this setup');
  if (candles.length < 3)       w.push('Insufficient AH candle data — confidence low');
  return w;
}

function analyzeSymbol(
  quote: QuoteResult,
  candles: Candle[],
  qqqAHChangePct: number,
): TickerAnalysis {
  const symbol   = quote.symbol;
  const isEtf    = ETF_SYMBOLS.has(symbol);

  const regularClose   = round2(quote.regularMarketPrice ?? 0);
  const ahChangePct    = round2(quote.postMarketChangePercent ?? 0);
  const ahChange       = round2(quote.postMarketChange ?? 0);
  const currentPrice   = round2(quote.postMarketPrice ?? regularClose);
  // Use today's regular volume as daily avg when 3-month avg unavailable
  const avgDailyVolume = quote.averageDailyVolume3Month > 0
    ? quote.averageDailyVolume3Month
    : quote.regularMarketVolume;

  const bid = quote.bid ?? 0;
  const ask = quote.ask ?? 0;
  const spread    = round2(Math.max(0, ask - bid));
  const midpoint  = bid > 0 && ask > 0 ? (ask + bid) / 2 : 0;
  const spreadPct = round2(midpoint > 0 ? (spread / midpoint) * 100 : 0);
  const liquidity = calcLiquidity(spreadPct, isEtf);

  const ahHigh  = candles.length > 0 ? round2(Math.max(...candles.map(c => c.high)))  : null;
  const ahLow   = candles.length > 0 ? round2(Math.min(...candles.map(c => c.low)))   : null;
  const ahRange = ahHigh !== null && ahLow !== null ? round2(ahHigh - ahLow) : null;
  const vwapRaw = calcVwap(candles);
  const vwap    = vwapRaw !== null ? round2(vwapRaw) : null;

  const ahVolume   = candles.reduce((s, c) => s + c.volume, 0);
  const ahExpected = avgDailyVolume * 0.05;
  const volSurge   = round2(ahExpected > 0 ? ahVolume / ahExpected : 0);

  const trend         = calcTrend(candles, ahChangePct, vwap);
  const momentumScore = calcMomentumScore(ahChangePct, ahVolume, quote.regularMarketVolume, candles, trend);
  const grade         = calcGrade(momentumScore, liquidity);
  const setupQuality  = grade === 'D' || liquidity === 'DANGEROUS' ? 'WAIT' : grade;

  const rsVsQQQPct = round2(ahChangePct - qqqAHChangePct);
  const rsVsQQQ    = rsVsQQQPct > 0.5 ? 'Outperforming' : rsVsQQQPct < -0.5 ? 'Underperforming' : 'Inline';

  const isBullish          = trend === 'Bullish continuation' || trend === 'Exhaustion move';
  const preferredDirection: 'long' | 'short' | 'neutral' =
    trend === 'Range chop' ? 'neutral' : isBullish ? 'long' : 'short';

  const keyLevels: KeyLevels = {
    ahHigh, ahLow, regularClose, vwap,
    breakoutLevel:  ahHigh,
    breakdownLevel: ahLow,
  };

  const longSetup: ScalpSetup = {
    entry:  ahHigh !== null
      ? `1-min close above AH high ($${ahHigh}) with volume confirmation`
      : 'Insufficient AH data for long entry',
    stop:   ahRange !== null
      ? `Below previous 1-min candle low (est. $${round2(currentPrice - ahRange * 0.2)})`
      : 'N/A',
    tp1:    ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 0.5) : null,
    tp2:    ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 1.0) : null,
    runner: ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 1.5) : null,
  };

  const shortSetup: ScalpSetup = {
    entry:  ahLow !== null
      ? `1-min close below AH low ($${ahLow}) with volume confirmation`
      : 'Insufficient AH data for short entry',
    stop:   ahRange !== null
      ? `Above previous 1-min candle high (est. $${round2(currentPrice + ahRange * 0.2)})`
      : 'N/A',
    tp1:    ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 0.5) : null,
    tp2:    ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 1.0) : null,
    runner: ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 1.5) : null,
  };

  const confirmationLogic = preferredDirection === 'long'
    ? 'Wait for 1-min candle to close above AH high with 1.5x+ AH average volume; QQQ AH must be green or neutral'
    : preferredDirection === 'short'
      ? 'Wait for 1-min candle to close below AH low with 1.5x+ AH average volume; QQQ AH must be red or neutral'
      : 'No directional bias — wait for momentum to develop';

  const riskWarnings = buildRiskWarnings(spreadPct, ahChangePct, trend, liquidity, candles);
  const rankScore    = calcRankScore(momentumScore, liquidity, grade, ahChangePct);
  const lastAHTradeTime = quote.postMarketTime
    ? new Date(quote.postMarketTime * 1000).toISOString()
    : null;

  return {
    symbol,
    shortName:        quote.shortName ?? symbol,
    currentPrice,
    regularClose,
    ahChange,
    ahChangePct,
    ahHigh, ahLow, ahRange, vwap,
    bid: round2(bid), ask: round2(ask), spread, spreadPct,
    liquidity, trend, momentumScore, grade, setupQuality,
    rsVsQQQ, rsVsQQQPct,
    ahVolume, avgDailyVolume, volSurge,
    keyLevels, longSetup, shortSetup,
    preferredDirection, confirmationLogic, riskWarnings,
    candleCount: candles.length,
    rankScore,
    lastAHTradeTime,
    dataSource: 'yahoo_finance_v8',
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const etOffset  = getETOffsetHours();
    const now       = new Date();
    const nowSec    = Math.floor(now.getTime() / 1000);

    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // AH: 4:00 PM – 8:00 PM ET
    const ahStartSec = Math.floor(utcMidnight / 1000) + (16 - etOffset) * 3600;
    const ahEndSec   = Math.floor(utcMidnight / 1000) + (20 - etOffset) * 3600;

    const sessionPhase: 'pre_ah' | 'after_hours' | 'post_ah' =
      nowSec < ahStartSec ? 'pre_ah' :
      nowSec < ahEndSec   ? 'after_hours' :
                            'post_ah';

    // Fetch all symbols in parallel — one request per symbol gives quote + candles
    const results = await Promise.allSettled(
      SYMBOLS.map(sym => fetchSymbolData(sym, ahStartSec, ahEndSec, nowSec)),
    );

    // Build analysis for each symbol that succeeded
    const analyses: TickerAnalysis[] = [];
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'rejected') {
        errors.push(`${SYMBOLS[i]}: ${res.reason?.message ?? 'fetch failed'}`);
        continue;
      }
      const { quote, candles } = res.value;
      // Skip symbols with no meaningful AH movement
      if ((quote.postMarketChangePercent ?? 0) === 0 && candles.length === 0) continue;
      analyses.push(analyzeSymbol(quote, candles, 0)); // placeholder qqqAHChangePct
    }

    if (analyses.length === 0) {
      throw new Error(
        errors.length > 0
          ? `Data fetch failed for all symbols. First error: ${errors[0]}`
          : 'No AH data available — market may be closed or before AH session',
      );
    }

    // Now that we have QQQ analysis, patch rsVsQQQ fields
    const qqqAnalysis = analyses.find(a => a.symbol === 'QQQ');
    const spyAnalysis = analyses.find(a => a.symbol === 'SPY');
    const qqqAHChangePct = qqqAnalysis?.ahChangePct ?? 0;
    const spyAHChangePct = spyAnalysis?.ahChangePct ?? 0;

    // Re-run analysis with correct QQQ reference
    const finalAnalyses: TickerAnalysis[] = [];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'rejected') continue;
      const { quote, candles } = res.value;
      if ((quote.postMarketChangePercent ?? 0) === 0 && candles.length === 0) continue;
      finalAnalyses.push(analyzeSymbol(quote, candles, qqqAHChangePct));
    }

    const allResults = finalAnalyses.sort((a, b) => b.rankScore - a.rankScore);

    const top3: TickerAnalysis[] = [];
    for (const r of allResults) {
      if (top3.length >= 3) break;
      if (r.grade === 'A' || r.grade === 'B') top3.push(r);
    }
    if (top3.length < 3) {
      for (const r of allResults) {
        if (top3.length >= 3) break;
        if (r.grade === 'C' && !top3.includes(r)) top3.push(r);
      }
    }

    const marketCondition: 'bullish' | 'bearish' | 'mixed' =
      qqqAHChangePct > 0 && spyAHChangePct > 0 ? 'bullish' :
      qqqAHChangePct < 0 && spyAHChangePct < 0 ? 'bearish' : 'mixed';

    return NextResponse.json({
      success:             true,
      scannedAt:           now.toISOString(),
      sessionPhase,
      qqqAHChange:         qqqAHChangePct,
      spyAHChange:         spyAHChangePct,
      marketCondition,
      symbolsScanned:      SYMBOLS.length,
      symbolsWithActivity: allResults.length,
      top3,
      allResults,
      fetchErrors:         errors.length > 0 ? errors : undefined,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'After-hours scan failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
