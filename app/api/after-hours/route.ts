import { NextResponse } from 'next/server';

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
}

const SYMBOLS = ['SPY','QQQ','NVDA','TSLA','AAPL','META','AMD','MSFT','TQQQ','SQQQ','IWM','PLTR','AMZN','SOFI'];
const ETF_SYMBOLS = new Set(['SPY','QQQ','TQQQ','SQQQ','IWM']);

async function fetchBatchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const csv = symbols.join(',');
  const fields = [
    'symbol','shortName','regularMarketPrice','regularMarketChange',
    'regularMarketChangePercent','regularMarketVolume','averageDailyVolume3Month',
    'postMarketPrice','postMarketChange','postMarketChangePercent','postMarketTime',
    'bid','ask','regularMarketDayHigh','regularMarketDayLow',
  ].join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(csv)}&fields=${fields}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradingApp/1.0)',
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Yahoo v7 quote fetch HTTP ${res.status}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo v7 returned HTML');

  const json = JSON.parse(text);
  return (json?.quoteResponse?.result ?? []) as QuoteResult[];
}

async function fetchAHCandles(symbol: string, ahStartSec: number): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${ahStartSec}&period2=${nowSec}&interval=1m&includePrePost=true`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradingApp/1.0)',
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`);

  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Yahoo chart returned HTML');

  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? 'No chart data');

  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  return timestamps
    .map((ts, i) => ({
      time:   ts,
      open:   q.open?.[i]   ?? 0,
      high:   q.high?.[i]   ?? 0,
      low:    q.low?.[i]    ?? 0,
      close:  q.close?.[i]  ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter(c => c.close > 0 && c.high > 0 && c.time >= ahStartSec);
}

function calcLiquidity(
  spreadPct: number,
  isEtf: boolean,
): 'SAFE' | 'MODERATE' | 'DANGEROUS' {
  if (isEtf) {
    return spreadPct < 0.03 ? 'SAFE' : spreadPct < 0.20 ? 'MODERATE' : 'DANGEROUS';
  }
  return spreadPct < 0.05 ? 'SAFE' : spreadPct < 0.20 ? 'MODERATE' : 'DANGEROUS';
}

function calcVwap(candles: Candle[]): number | null {
  if (!candles.length) return null;
  let cumTPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

function calcTrend(
  candles: Candle[],
  ahChangePct: number,
  currentPrice: number,
  vwap: number | null,
): string {
  const last5 = candles.slice(-5);
  const bullishLast5 = last5.filter(c => c.close >= c.open).length;
  const bearishLast5 = last5.length - bullishLast5;

  if (Math.abs(ahChangePct) < 0.3) return 'Range chop';
  if (ahChangePct > 1.5 && bearishLast5 >= 3) return 'Exhaustion move';

  const initialAHUp = ahChangePct > 0;
  if (vwap !== null && candles.length >= 3) {
    const recent3 = candles.slice(-3);
    const recentUp = recent3.every(c => c.close >= c.open);
    const recentDown = recent3.every(c => c.close < c.open);
    if (initialAHUp && recentDown) return 'Reversal setup';
    if (!initialAHUp && recentUp) return 'Reversal setup';
  }

  if (bullishLast5 >= 4 && ahChangePct > 0) return 'Bullish continuation';
  if (bearishLast5 >= 4 && ahChangePct < 0) return 'Bearish continuation';

  return ahChangePct > 0 ? 'Bullish continuation' : 'Bearish continuation';
}

function calcMomentumScore(
  ahChangePct: number,
  ahCandleVolume: number,
  avgDailyVolume: number,
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

  const ahExpectedVol = avgDailyVolume * 0.05;
  const volSurge = ahExpectedVol > 0 ? ahCandleVolume / ahExpectedVol : 0;
  if (volSurge > 5)        score += 3;
  else if (volSurge > 3)   score += 2.5;
  else if (volSurge > 2)   score += 2;
  else if (volSurge > 1.5) score += 1.5;
  else if (volSurge > 1)   score += 1;
  else                     score += 0.3;

  const last8 = candles.slice(-8);
  const bullishCount = last8.filter(c => c.close >= c.open).length;
  const bullishPct = last8.length > 0 ? bullishCount / last8.length : 0;
  const isBullishTrend = trend.toLowerCase().includes('bullish') || trend === 'Exhaustion move';
  const consistency = isBullishTrend ? bullishPct : 1 - bullishPct;
  if (consistency > 0.85)      score += 2;
  else if (consistency > 0.70) score += 1.5;
  else if (consistency > 0.55) score += 1;
  else                         score += 0.3;

  const last5 = candles.slice(-5);
  if (last5.length >= 2) {
    const recentMove = (last5[last5.length - 1].close - last5[0].open) / last5[0].open * 100;
    const absRecent = Math.abs(recentMove);
    if (absRecent > 0.5)       score += 2;
    else if (absRecent > 0.3)  score += 1.5;
    else if (absRecent > 0.15) score += 1;
    else                       score += 0.3;
  } else {
    score += 0.3;
  }

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

function calcGrade(
  score: number,
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS',
): 'A' | 'B' | 'C' | 'D' {
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
  const liqScore = liquidity === 'SAFE' ? 10 : liquidity === 'MODERATE' ? 6 : 2;
  const gradeScore = grade === 'A' ? 10 : grade === 'B' ? 7 : grade === 'C' ? 5 : 2;
  return round2(
    score * 0.40 +
    liqScore * 0.20 +
    gradeScore * 0.25 +
    Math.min(10, Math.abs(ahChangePct)) * 0.15,
  );
}

function buildRiskWarnings(
  spreadPct: number,
  ahChangePct: number,
  trend: string,
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS',
  candles: Candle[],
  candleCount: number,
): string[] {
  const warnings: string[] = [];

  if (spreadPct > 0.15) warnings.push('Spread widening — execution risk elevated');
  if (Math.abs(ahChangePct) > 5) warnings.push('Extended move — exhaustion/fade risk; avoid chasing');
  if (trend === 'Range chop') warnings.push('Low momentum — chop conditions likely');
  if (trend === 'Exhaustion move') warnings.push('Exhaustion detected — reversal risk is high');

  if (candles.length >= 6) {
    const last3Vol  = candles.slice(-3).reduce((s, c) => s + c.volume, 0);
    const prev3Vol  = candles.slice(-6, -3).reduce((s, c) => s + c.volume, 0);
    if (last3Vol < prev3Vol) warnings.push('Volume collapsing — momentum fading');
  }

  if (liquidity === 'DANGEROUS') warnings.push('DANGEROUS spread — skip this setup');
  if (candleCount < 3) warnings.push('Insufficient AH data — confidence low');

  return warnings;
}

function analyzeSymbol(
  quote: QuoteResult,
  candles: Candle[],
  qqqAHChangePct: number,
): TickerAnalysis {
  const symbol = quote.symbol;
  const isEtf = ETF_SYMBOLS.has(symbol);

  const regularClose  = round2(quote.regularMarketPrice ?? 0);
  const ahChangePct   = round2(quote.postMarketChangePercent ?? 0);
  const ahChange      = round2(quote.postMarketChange ?? 0);
  const currentPrice  = round2(quote.postMarketPrice ?? regularClose);
  const avgDailyVolume = quote.averageDailyVolume3Month ?? 0;

  const bid = quote.bid ?? 0;
  const ask = quote.ask ?? 0;
  const spread = round2(ask - bid);
  const midpoint = (ask + bid) / 2;
  const spreadPct = round2(midpoint > 0 ? (spread / midpoint) * 100 : 0);
  const liquidity = calcLiquidity(spreadPct, isEtf);

  const ahHigh   = candles.length > 0 ? round2(Math.max(...candles.map(c => c.high)))  : null;
  const ahLow    = candles.length > 0 ? round2(Math.min(...candles.map(c => c.low)))   : null;
  const ahRange  = ahHigh !== null && ahLow !== null ? round2(ahHigh - ahLow) : null;
  const vwap     = candles.length > 0 ? (calcVwap(candles) !== null ? round2(calcVwap(candles)!) : null) : null;

  const ahVolume = candles.reduce((s, c) => s + c.volume, 0);
  const ahExpectedVol = avgDailyVolume * 0.05;
  const volSurge = round2(ahExpectedVol > 0 ? ahVolume / ahExpectedVol : 0);

  const trend = calcTrend(candles, ahChangePct, currentPrice, vwap);
  const momentumScore = calcMomentumScore(ahChangePct, ahVolume, avgDailyVolume, candles, trend);
  const grade = calcGrade(momentumScore, liquidity);
  const setupQuality = grade === 'D' || liquidity === 'DANGEROUS' ? 'WAIT' : grade;

  const rsVsQQQPct = round2(ahChangePct - qqqAHChangePct);
  const rsVsQQQ = rsVsQQQPct > 0.5 ? 'Outperforming' : rsVsQQQPct < -0.5 ? 'Underperforming' : 'Inline';

  const isBullishTrend = trend === 'Bullish continuation' || trend === 'Exhaustion move';
  const preferredDirection: 'long' | 'short' | 'neutral' =
    trend === 'Range chop' ? 'neutral' : isBullishTrend ? 'long' : 'short';

  const keyLevels: KeyLevels = {
    ahHigh,
    ahLow,
    regularClose,
    vwap,
    breakoutLevel: ahHigh,
    breakdownLevel: ahLow,
  };

  const longSetup: ScalpSetup = {
    entry: ahHigh !== null
      ? `1-min close above AH high ($${ahHigh}) with volume confirmation`
      : 'Insufficient AH data for long entry',
    stop: ahRange !== null
      ? `Below previous 1-min candle low (est. $${round2(currentPrice - ahRange * 0.2)})`
      : 'N/A',
    tp1:    ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 0.5) : null,
    tp2:    ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 1.0) : null,
    runner: ahHigh !== null && ahRange !== null ? round2(ahHigh + ahRange * 1.5) : null,
  };

  const shortSetup: ScalpSetup = {
    entry: ahLow !== null
      ? `1-min close below AH low ($${ahLow}) with volume confirmation`
      : 'Insufficient AH data for short entry',
    stop: ahRange !== null
      ? `Above previous 1-min candle high (est. $${round2(currentPrice + ahRange * 0.2)})`
      : 'N/A',
    tp1:    ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 0.5) : null,
    tp2:    ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 1.0) : null,
    runner: ahLow !== null && ahRange !== null ? round2(ahLow - ahRange * 1.5) : null,
  };

  const isBullish = preferredDirection === 'long';
  const confirmationLogic = isBullish
    ? 'Wait for 1-min candle to close above AH high with 1.5x+ AH average volume; QQQ AH must be green or neutral'
    : preferredDirection === 'short'
      ? 'Wait for 1-min candle to close below AH low with 1.5x+ AH average volume; QQQ AH must be red or neutral'
      : 'No directional bias — wait for momentum to develop';

  const candleCount = candles.length;
  const riskWarnings = buildRiskWarnings(spreadPct, ahChangePct, trend, liquidity, candles, candleCount);

  const lastAHTradeTime = quote.postMarketTime
    ? new Date(quote.postMarketTime * 1000).toISOString()
    : null;

  const rankScore = calcRankScore(momentumScore, liquidity, grade, ahChangePct);

  return {
    symbol,
    shortName:        quote.shortName ?? symbol,
    currentPrice,
    regularClose,
    ahChange,
    ahChangePct,
    ahHigh,
    ahLow,
    ahRange,
    vwap,
    bid:              round2(bid),
    ask:              round2(ask),
    spread,
    spreadPct,
    liquidity,
    trend,
    momentumScore,
    grade,
    setupQuality,
    rsVsQQQ,
    rsVsQQQPct,
    ahVolume,
    avgDailyVolume,
    volSurge,
    keyLevels,
    longSetup,
    shortSetup,
    preferredDirection,
    confirmationLogic,
    riskWarnings,
    candleCount,
    rankScore,
    lastAHTradeTime,
  };
}

export async function GET() {
  try {
    const etOffset = getETOffsetHours();
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);

    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    // AH window: 16:00 ET = 16 - etOffset hours UTC
    const ahStartUTC = utcMidnight + (16 - etOffset) * 3600 * 1000;
    const ahEndUTC   = utcMidnight + (20 - etOffset) * 3600 * 1000;
    const ahStartSec = Math.floor(ahStartUTC / 1000);
    const ahEndSec   = Math.floor(ahEndUTC / 1000);

    const nowET = now.getTime() / 1000 - etOffset * 3600;
    const nowHourET = new Date(nowET * 1000).getUTCHours();

    let sessionPhase: 'pre_ah' | 'after_hours' | 'post_ah';
    if (nowSec < ahStartSec)    sessionPhase = 'pre_ah';
    else if (nowSec < ahEndSec) sessionPhase = 'after_hours';
    else                        sessionPhase = 'post_ah';

    const quotes = await fetchBatchQuotes(SYMBOLS);
    if (!quotes.length) throw new Error('No quote data returned from Yahoo Finance');

    const qqqQuote = quotes.find(q => q.symbol === 'QQQ');
    const spyQuote = quotes.find(q => q.symbol === 'SPY');
    const qqqAHChangePct = round2(qqqQuote?.postMarketChangePercent ?? 0);
    const spyAHChangePct = round2(spyQuote?.postMarketChangePercent ?? 0);

    const marketCondition: 'bullish' | 'bearish' | 'mixed' =
      qqqAHChangePct > 0 && spyAHChangePct > 0 ? 'bullish' :
      qqqAHChangePct < 0 && spyAHChangePct < 0 ? 'bearish' :
      'mixed';

    const activeQuotes = quotes.filter(q => {
      if (!q.postMarketPrice) return false;
      return Math.abs(q.postMarketChangePercent ?? 0) >= 0.1;
    });

    const candleResults = await Promise.allSettled(
      activeQuotes.map(q => fetchAHCandles(q.symbol, ahStartSec)),
    );

    const candleMap = new Map<string, Candle[]>();
    activeQuotes.forEach((q, i) => {
      const result = candleResults[i];
      if (result.status === 'fulfilled') {
        const filtered = result.value.filter(c => c.time >= ahStartSec && c.time <= Math.min(nowSec, ahEndSec));
        candleMap.set(q.symbol, filtered);
      } else {
        candleMap.set(q.symbol, []);
      }
    });

    const allResults: TickerAnalysis[] = activeQuotes
      .map(q => analyzeSymbol(q, candleMap.get(q.symbol) ?? [], qqqAHChangePct))
      .sort((a, b) => b.rankScore - a.rankScore);

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

    return NextResponse.json({
      success:             true,
      scannedAt:           now.toISOString(),
      sessionPhase,
      qqqAHChange:         qqqAHChangePct,
      spyAHChange:         spyAHChangePct,
      marketCondition,
      symbolsScanned:      quotes.length,
      symbolsWithActivity: activeQuotes.length,
      top3,
      allResults,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error:   err instanceof Error ? err.message : 'After-hours data unavailable',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
