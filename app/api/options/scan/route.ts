// app/api/options/scan/route.ts — Options scanner: 7 sections
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';
import { fetchFinvizPublicScreener } from '@/lib/finviz-public';
import { fetchOptionsChain } from '@/lib/options-fetcher';
import type { PutContract } from '@/lib/options-fetcher';

const WATCHLIST = [
  'QQQ','SPY','IWM','NVDA','TSLA','AMD','META','AAPL','MSFT','AMZN',
  'GOOGL','ARKK','SOFI','PLTR','COIN','SMCI','ARM','MSTR','RIVN','LCID',
];
const CORE = ['QQQ','SPY','IWM','NVDA','TSLA','AMD','META','AAPL','MSFT'];

const sectionCache = new Map<string, { data: unknown; ts: number }>();
const SECTION_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const e = sectionCache.get(key);
  if (e && Date.now() - e.ts < SECTION_TTL) return e.data as T;
  return null;
}
function setCache(key: string, data: unknown) {
  sectionCache.set(key, { data, ts: Date.now() });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface QuoteMap {
  [symbol: string]: {
    price: number;
    changePercent: number;
    // Finviz relative fields (preferred)
    sma50rel: 'above' | 'below' | null;
    sma200rel: 'above' | 'below' | null;
    rvol: number | null;
    unusualVolume: boolean;
    // Yahoo fallback fields (used when Finviz blocked)
    fiftyDayAverage: number;
    twoHundredDayAverage: number;
    regularMarketVolume: number;
    averageVolume: number;
    fiftyTwoWeekHigh: number;
  };
}

async function fetchQuotesMap(symbols: string[]): Promise<QuoteMap> {
  const map: QuoteMap = {};

  // Try Finviz first
  const fvResult = await fetchFinvizPublicScreener(symbols);

  if (!fvResult.blocked && fvResult.data.length > 0) {
    for (const q of fvResult.data) {
      map[q.symbol] = {
        price: q.price ?? 0,
        changePercent: q.changePercent ?? 0,
        sma50rel: q.sma50rel,
        sma200rel: q.sma200rel,
        rvol: q.rvol,
        unusualVolume: q.unusualVolume,
        // Not available from Finviz directly; leave as 0 (not used when sma*rel present)
        fiftyDayAverage: 0,
        twoHundredDayAverage: 0,
        regularMarketVolume: 0,
        averageVolume: 0,
        fiftyTwoWeekHigh: 0,
      };
    }
    // Fill any missing tickers via Yahoo
    const missing = symbols.filter((s) => !map[s]);
    if (missing.length > 0) {
      const yahooQuotes = await fetchYahooQuotes(missing);
      for (const q of yahooQuotes) {
        map[q.symbol] = {
          price: q.regularMarketPrice ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          sma50rel: null,
          sma200rel: null,
          rvol: null,
          unusualVolume: false,
          fiftyDayAverage: q.fiftyDayAverage ?? 0,
          twoHundredDayAverage: q.twoHundredDayAverage ?? 0,
          regularMarketVolume: q.regularMarketVolume ?? 0,
          averageVolume: (q as unknown as Record<string, number>).averageDailyVolume3Month ?? 0,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
        };
      }
    }
    return map;
  }

  // Finviz blocked — fall back entirely to Yahoo
  const quotes = await fetchYahooQuotes(symbols);
  for (const q of quotes) {
    const vol = q.regularMarketVolume ?? 0;
    const avgVol = (q as unknown as Record<string, number>).averageDailyVolume3Month ?? 0;
    const price = q.regularMarketPrice ?? 0;
    const sma50 = q.fiftyDayAverage ?? 0;
    const sma200 = q.twoHundredDayAverage ?? 0;
    map[q.symbol] = {
      price,
      changePercent: q.regularMarketChangePercent ?? 0,
      sma50rel: sma50 > 0 ? (price >= sma50 ? 'above' : 'below') : null,
      sma200rel: sma200 > 0 ? (price >= sma200 ? 'above' : 'below') : null,
      rvol: avgVol > 0 ? vol / avgVol : null,
      unusualVolume: avgVol > 0 && vol >= avgVol * 2,
      fiftyDayAverage: sma50,
      twoHundredDayAverage: sma200,
      regularMarketVolume: vol,
      averageVolume: avgVol,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
    };
  }
  return map;
}

function bearThesis(quote: QuoteMap[string]): string {
  const parts: string[] = [];
  if (quote.sma50rel === 'below') parts.push('Below 50d MA');
  if (quote.sma200rel === 'below') parts.push('Below 200d MA');
  if (quote.changePercent < -2) parts.push('Strong daily sell-off');
  else if (quote.changePercent < -1) parts.push('Negative daily momentum');
  if (quote.unusualVolume || (quote.rvol !== null && quote.rvol >= 1.5)) parts.push('Volume surge');
  return parts.length > 0 ? parts.join(', ') : 'No clear bear signal';
}

function scoreSection1(quote: QuoteMap[string], put: PutContract): number {
  let score = 0;
  if (quote.sma50rel === 'below') score += 15;
  if (quote.sma200rel === 'below') score += 10;
  if (quote.changePercent < -2) score += 15;
  else if (quote.changePercent < -1) score += 10;
  if (quote.unusualVolume || (quote.rvol !== null && quote.rvol >= 1.5)) score += 10;
  // delta closest to -0.55
  const deltaDiff = Math.abs(Math.abs(put.delta) - 0.55);
  if (deltaDiff < 0.05) score += 10;
  else if (deltaDiff < 0.10) score += 5;
  if (put.openInterest > 5000) score += 10;
  else if (put.openInterest > 1000) score += 5;
  return Math.min(100, score);
}

// ─── Section 1: High Probability Puts ───────────────────────────────────────

async function section1() {
  const cached = getCached<unknown[]>('s1');
  if (cached) return cached;

  const quotes = await fetchQuotesMap(CORE);
  const results: unknown[] = [];

  await Promise.allSettled(
    CORE.map(async (ticker) => {
      const q = quotes[ticker];
      if (!q || q.price === 0) return;
      const opts = await fetchOptionsChain(ticker);
      if (opts.error || opts.puts.length === 0) return;

      const candidates = opts.puts.filter(
        (p) =>
          p.daysToExpiry >= 7 && p.daysToExpiry <= 45 &&
          p.delta >= -0.70 && p.delta <= -0.40 &&
          p.openInterest >= 500 && p.volume >= 100 &&
          p.spreadPct < 10
      );
      if (candidates.length === 0) return;

      const scored = candidates.map((p) => ({ put: p, score: scoreSection1(q, p) }));
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      const priceMove = q.price * 0.07;
      const expectedReturn = best.put.lastPrice > 0
        ? Math.round(Math.abs(best.put.delta) * priceMove / best.put.lastPrice * 100)
        : 0;

      const riskRating = best.score > 70 ? 'Low' : best.score >= 50 ? 'Medium' : 'High';

      results.push({
        ticker,
        price: q.price,
        changePercent: q.changePercent,
        bearThesis: bearThesis(q),
        score: best.score,
        riskRating,
        put: best.put,
        targetPrice: Math.round(q.price * 0.93 * 100) / 100,
        resistance: q.fiftyTwoWeekHigh > 0 ? Math.round(q.fiftyTwoWeekHigh * 100) / 100 : null,
        expectedReturn,
        expLabel: fmtDate(best.put.expiration),
      });
    })
  );

  (results as { score: number }[]).sort((a, b) => b.score - a.score);
  const top10 = results.slice(0, 10);
  setCache('s1', top10);
  return top10;
}

// ─── Section 2: Cheap High Delta Puts ───────────────────────────────────────

async function section2() {
  const cached = getCached<unknown>('s2');
  if (cached) return cached;

  const results: { bucket50: unknown[]; bucket75: unknown[]; bucket100: unknown[] } = {
    bucket50: [], bucket75: [], bucket100: [],
  };

  await Promise.allSettled(
    WATCHLIST.map(async (ticker) => {
      const opts = await fetchOptionsChain(ticker);
      if (opts.error || opts.puts.length === 0) return;

      const candidates = opts.puts.filter(
        (p) =>
          p.lastPrice * 100 <= 100 &&
          p.delta >= -0.85 && p.delta <= -0.35 &&
          p.openInterest >= 200 && p.volume >= 50 &&
          p.spreadPct < 15 &&
          p.daysToExpiry >= 7 && p.daysToExpiry <= 30
      );

      for (const p of candidates) {
        const cost = Math.round(p.lastPrice * 100);
        const entry = {
          ticker,
          price: opts.price,
          put: p,
          cost,
          expLabel: fmtDate(p.expiration),
        };
        if (cost <= 50) results.bucket50.push(entry);
        if (cost <= 75) results.bucket75.push(entry);
        if (cost <= 100) results.bucket100.push(entry);
      }
    })
  );

  // Sort each bucket by delta (most negative first)
  const sortByDelta = (arr: unknown[]) =>
    (arr as { put: PutContract }[]).sort((a, b) => a.put.delta - b.put.delta).slice(0, 10);

  const out = {
    bucket50: sortByDelta(results.bucket50),
    bucket75: sortByDelta(results.bucket75),
    bucket100: sortByDelta(results.bucket100),
  };
  setCache('s2', out);
  return out;
}

// ─── Section 3: Power Hour ───────────────────────────────────────────────────

async function section3() {
  const cached = getCached<unknown[]>('s3');
  if (cached) return cached;

  const quotes = await fetchQuotesMap(CORE);
  const results: unknown[] = [];

  await Promise.allSettled(
    CORE.map(async (ticker) => {
      const q = quotes[ticker];
      if (!q || q.price === 0) return;
      const opts = await fetchOptionsChain(ticker);
      if (opts.error || opts.puts.length === 0) return;

      const candidates = opts.puts.filter(
        (p) =>
          p.daysToExpiry >= 0 && p.daysToExpiry <= 5 &&
          p.delta >= -0.65 && p.delta <= -0.45 &&
          p.spreadPct < 8
      );
      if (candidates.length === 0) return;

      // Score: negative change, high rvol, near 50d MA as VWAP proxy
      const score =
        (q.changePercent < -1 ? 30 : q.changePercent < 0 ? 10 : 0) +
        (q.rvol !== null && q.rvol >= 2 ? 30 : q.rvol !== null && q.rvol >= 1.5 ? 15 : 0) +
        (q.sma50rel !== null ? 20 : 0);

      const confidence = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';
      const best = candidates.sort((a, b) => Math.abs(a.delta + 0.55) - Math.abs(b.delta + 0.55))[0];

      results.push({
        ticker,
        price: q.price,
        changePercent: q.changePercent,
        put: best,
        expLabel: fmtDate(best.expiration),
        score,
        confidence,
        entryZoneLow: Math.round((best.lastPrice * 0.95) * 100) / 100,
        entryZoneHigh: Math.round((best.lastPrice * 1.05) * 100) / 100,
        stop: Math.round((best.strike * 1.02) * 100) / 100,
        profitTarget: Math.round((best.strike - best.lastPrice * 2) * 100) / 100,
      });
    })
  );

  (results as { score: number }[]).sort((a, b) => b.score - a.score);
  const top5 = results.slice(0, 5);
  setCache('s3', top5);
  return top5;
}

// ─── Section 4: Crash Watchlist ──────────────────────────────────────────────

const CRASH_NAMES = [
  { ticker: 'ARKK', sector: 'Growth ETF', sensitivity: 95, avgDrawdown: -75 },
  { ticker: 'TSLA', sector: 'Consumer Discretionary', sensitivity: 90, avgDrawdown: -65 },
  { ticker: 'COIN', sector: 'Crypto/Fintech', sensitivity: 92, avgDrawdown: -80 },
  { ticker: 'MSTR', sector: 'Crypto/Tech', sensitivity: 95, avgDrawdown: -85 },
  { ticker: 'RIVN', sector: 'EV/Auto', sensitivity: 88, avgDrawdown: -70 },
  { ticker: 'PLTR', sector: 'Tech/Defense', sensitivity: 82, avgDrawdown: -60 },
  { ticker: 'SMCI', sector: 'Technology', sensitivity: 85, avgDrawdown: -70 },
  { ticker: 'IWM', sector: 'Small Cap ETF', sensitivity: 78, avgDrawdown: -45 },
  { ticker: 'SOFI', sector: 'Regional Fintech', sensitivity: 80, avgDrawdown: -55 },
  { ticker: 'NVDA', sector: 'Semiconductors', sensitivity: 75, avgDrawdown: -65 },
  { ticker: 'LCID', sector: 'EV/Auto', sensitivity: 87, avgDrawdown: -72 },
  { ticker: 'AMD', sector: 'Semiconductors', sensitivity: 72, avgDrawdown: -55 },
];

async function section4() {
  const cached = getCached<unknown[]>('s4');
  if (cached) return cached;

  const tickers = CRASH_NAMES.map((c) => c.ticker);
  const quotes = await fetchQuotesMap(tickers);

  const results = await Promise.all(
    CRASH_NAMES.map(async (item) => {
      const q = quotes[item.ticker];
      const price = q?.price ?? 0;

      const opts = await fetchOptionsChain(item.ticker);

      // Find ATM, 10% OTM, 20% OTM puts with 30-90 DTE
      const pooled = opts.puts.filter(
        (p) => p.daysToExpiry >= 30 && p.daysToExpiry <= 90 && p.openInterest >= 100
      );

      function findNearestStrike(targetStrike: number): PutContract | null {
        if (pooled.length === 0) return null;
        return pooled.reduce((prev, cur) =>
          Math.abs(cur.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? cur : prev
        );
      }

      const atm = findNearestStrike(price);
      const otm10 = findNearestStrike(price * 0.9);
      const otm20 = findNearestStrike(price * 0.8);

      return {
        ...item,
        price,
        changePercent: q?.changePercent ?? 0,
        suggestedPuts: {
          atm: atm ? { strike: atm.strike, lastPrice: atm.lastPrice, expLabel: fmtDate(atm.expiration), daysToExpiry: atm.daysToExpiry } : null,
          otm10: otm10 ? { strike: otm10.strike, lastPrice: otm10.lastPrice, expLabel: fmtDate(otm10.expiration), daysToExpiry: otm10.daysToExpiry } : null,
          otm20: otm20 ? { strike: otm20.strike, lastPrice: otm20.lastPrice, expLabel: fmtDate(otm20.expiration), daysToExpiry: otm20.daysToExpiry } : null,
        },
      };
    })
  );

  setCache('s4', results);
  return results;
}

// ─── Section 5: Black Swan Hedges ────────────────────────────────────────────

const HEDGE_TICKERS = ['QQQ', 'SPY', 'IWM', 'ARKK'];

async function section5() {
  const cached = getCached<unknown[]>('s5');
  if (cached) return cached;

  const quotes = await fetchQuotesMap(HEDGE_TICKERS);
  const DROP_LEVELS = [0.10, 0.20, 0.30, 0.40, 0.50];

  const results = await Promise.all(
    HEDGE_TICKERS.map(async (ticker) => {
      const q = quotes[ticker];
      const price = q?.price ?? 0;

      const opts = await fetchOptionsChain(ticker);
      const pooled = opts.puts.filter(
        (p) => p.daysToExpiry >= 180 && p.daysToExpiry <= 540 && p.openInterest >= 50
      );

      const strikeData = DROP_LEVELS.map((drop) => {
        const targetStrike = Math.round(price * (1 - drop) / 5) * 5; // round to nearest $5
        const put = pooled.reduce<PutContract | null>((prev, cur) => {
          if (!prev) return cur;
          return Math.abs(cur.strike - targetStrike) < Math.abs(prev.strike - targetStrike) ? cur : prev;
        }, null);

        if (!put) return { drop, targetStrike, put: null, roi: null };

        const costBasis = put.lastPrice * 100; // per contract
        const scenarioPrice = price * (1 - drop);
        const intrinsic = Math.max(0, put.strike - scenarioPrice);
        const timeValueFloor = price * 0.02; // 2% of current price
        const estimatedValue = intrinsic + timeValueFloor;
        const roi = costBasis > 0 ? Math.round(((estimatedValue * 100 - costBasis) / costBasis) * 100) : null;

        return {
          drop: Math.round(drop * 100),
          targetStrike: put.strike,
          lastPrice: put.lastPrice,
          costBasis,
          expLabel: fmtDate(put.expiration),
          daysToExpiry: put.daysToExpiry,
          estimatedValue: Math.round(estimatedValue * 100) / 100,
          roi,
        };
      });

      return { ticker, price, strikeData };
    })
  );

  setCache('s5', results);
  return results;
}

// ─── Section 6: Fear Index ────────────────────────────────────────────────────

async function section6() {
  const cached = getCached<unknown>('s6');
  if (cached) return cached;

  const quotes = await fetchQuotesMap(['^VIX', '^VXN', 'QQQ', 'SPY']);
  const vix = quotes['^VIX']?.price ?? quotes['VIX']?.price ?? 20;
  const vxn = quotes['^VXN']?.price ?? quotes['VXN']?.price ?? 25;
  const qqq = quotes['QQQ'];
  const spy = quotes['SPY'];

  let vixLabel = 'Normal';
  let signalColor = 'yellow';
  if (vix < 15) { vixLabel = 'Complacency'; signalColor = 'green'; }
  else if (vix < 20) { vixLabel = 'Normal'; signalColor = 'yellow'; }
  else if (vix < 30) { vixLabel = 'Elevated Fear'; signalColor = 'orange'; }
  else { vixLabel = 'Panic / Crash Risk'; signalColor = 'red'; }

  const qqqTrend = qqq ? (qqq.sma50rel === 'above' ? 'Above 50d MA' : qqq.sma50rel === 'below' ? 'Below 50d MA' : 'N/A') : 'N/A';
  const spyTrend = spy ? (spy.sma50rel === 'above' ? 'Above 50d MA' : spy.sma50rel === 'below' ? 'Below 50d MA' : 'N/A') : 'N/A';

  let overallSignal = 'Neutral';
  if (vix < 15 && qqq?.sma50rel === 'above') overallSignal = 'Bullish';
  else if (vix > 30) overallSignal = 'Crash Risk Elevated';
  else if (vix > 20 || (qqq && qqq.sma50rel === 'below')) overallSignal = 'Bearish';

  interface CrashProbs { d30: number; d90: number; m6: number; m12: number }
  let crashProbs: CrashProbs = { d30: 8, d90: 15, m6: 22, m12: 32 };
  if (vix < 15) crashProbs = { d30: 3, d90: 8, m6: 15, m12: 25 };
  else if (vix < 20) crashProbs = { d30: 8, d90: 15, m6: 22, m12: 32 };
  else if (vix < 25) crashProbs = { d30: 15, d90: 25, m6: 35, m12: 45 };
  else if (vix < 30) crashProbs = { d30: 25, d90: 38, m6: 50, m12: 60 };
  else crashProbs = { d30: 40, d90: 55, m6: 65, m12: 72 };

  const result = {
    vix,
    vxn,
    vixLabel,
    signalColor,
    overallSignal,
    crashProbs,
    qqqPrice: qqq?.price ?? 0,
    qqqChangePercent: qqq?.changePercent ?? 0,
    qqqTrend,
    spyPrice: spy?.price ?? 0,
    spyChangePercent: spy?.changePercent ?? 0,
    spyTrend,
  };

  setCache('s6', result);
  return result;
}

// ─── Section 7: Top 5 ────────────────────────────────────────────────────────

async function section7() {
  const cached = getCached<unknown[]>('s7');
  if (cached) return cached;

  const [s1, s2, s3] = await Promise.all([section1(), section2(), section3()]);

  interface S1Item {
    ticker: string;
    score: number;
    put: PutContract;
    price: number;
    bearThesis: string;
    targetPrice: number;
    expectedReturn: number;
    riskRating: string;
    expLabel: string;
  }
  interface S3Item {
    ticker: string;
    score: number;
    put: PutContract;
    price: number;
    confidence: string;
    profitTarget: number;
    stop: number;
    entryZoneLow: number;
    entryZoneHigh: number;
    expLabel: string;
  }
  interface S2Bucket {
    bucket100: { ticker: string; put: PutContract; cost: number; expLabel: string; price: number }[];
  }

  const candidates: Array<{ ticker: string; score: number; source: string; details: unknown }> = [];
  const seen = new Set<string>();

  for (const item of (s1 as S1Item[])) {
    if (!seen.has(item.ticker)) {
      seen.add(item.ticker);
      candidates.push({
        ticker: item.ticker,
        score: item.score,
        source: 'High Prob',
        details: {
          entry: item.put.lastPrice,
          target: item.targetPrice,
          stop: item.put.strike * 1.02,
          expectedReturn: `+${item.expectedReturn}%`,
          reason: item.bearThesis,
          put: item.put,
          expLabel: item.expLabel,
          price: item.price,
          riskRating: item.riskRating,
        },
      });
    }
    if (candidates.length >= 5) break;
  }

  for (const item of (s3 as S3Item[])) {
    if (!seen.has(item.ticker) && candidates.length < 5) {
      seen.add(item.ticker);
      candidates.push({
        ticker: item.ticker,
        score: item.score,
        source: 'Power Hour',
        details: {
          entry: item.put.lastPrice,
          target: item.profitTarget,
          stop: item.stop,
          expectedReturn: item.confidence,
          reason: `Power Hour play, ${item.confidence} confidence`,
          put: item.put,
          expLabel: item.expLabel,
          price: item.price,
          riskRating: item.confidence === 'High' ? 'Low' : 'Medium',
        },
      });
    }
  }

  const s2typed = s2 as S2Bucket;
  for (const item of (s2typed.bucket100 ?? [])) {
    if (!seen.has(item.ticker) && candidates.length < 5) {
      seen.add(item.ticker);
      candidates.push({
        ticker: item.ticker,
        score: 50,
        source: 'Cheap',
        details: {
          entry: item.put.lastPrice,
          target: item.put.strike - item.put.lastPrice,
          stop: item.put.strike * 1.03,
          expectedReturn: 'High leverage',
          reason: `Cheap high-delta put, cost $${item.cost}`,
          put: item.put,
          expLabel: item.expLabel,
          price: item.price,
          riskRating: 'Medium',
        },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top5 = candidates.slice(0, 5).map((c, i) => ({ rank: i + 1, ...c }));
  setCache('s7', top5);
  return top5;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = parseInt(searchParams.get('section') ?? '1', 10);

  try {
    let results: unknown;
    switch (section) {
      case 1: results = await section1(); break;
      case 2: results = await section2(); break;
      case 3: results = await section3(); break;
      case 4: results = await section4(); break;
      case 5: results = await section5(); break;
      case 6: results = await section6(); break;
      case 7: results = await section7(); break;
      default: return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    return NextResponse.json({
      section,
      results,
      fetchedAt: new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    return NextResponse.json({
      section,
      results: null,
      fetchedAt: new Date().toISOString(),
      error: String(err),
    }, { status: 500 });
  }
}
