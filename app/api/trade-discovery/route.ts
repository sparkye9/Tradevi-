import { NextRequest, NextResponse } from 'next/server';
import { getYahooSession, fetchYahooOptionsChain } from '@/lib/yahooFinance';
import type { OptionContract } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const YF_BASE = 'https://query1.finance.yahoo.com';
const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const YF_HEADERS = {
  'User-Agent': YF_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

// Universe of symbols to scan
const FUTURES_SYMBOLS = ['ES=F', 'NQ=F', 'YM=F', 'RTY=F'];
const INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', '^VIX'];
const MACRO_SYMBOLS = ['^TNX', 'DX=F', 'CL=F', 'GC=F']; // 10Y yield, DXY, Oil, Gold
const SECTOR_SYMBOLS = ['XLK', 'XLE', 'XLF', 'XLV', 'XLI', 'XLY', 'XLP', 'XLRE', 'SMH'];
const MEGA_CAP = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'AVGO', 'AMD'];
const HIGH_BETA = ['PLTR', 'MSTR', 'COIN', 'HOOD', 'RIOT', 'MARA', 'SOFI', 'LCID', 'RIVN'];
const POLICY_SYMBOLS = ['LMT', 'RTX', 'NOC', 'GD', 'AXON', 'GEO', 'CXW', 'ORCL', 'SMCI', 'XOM', 'CVX'];
const WATCHLIST_SYMBOLS = ['JPM', 'BAC', 'GS', 'C', 'COST', 'WMT', 'CAT', 'DE', 'NUE', 'UNH', 'HCA', 'AI', 'IONQ', 'PANW'];

const ALL_SYMBOLS = [
  ...FUTURES_SYMBOLS,
  ...INDEX_SYMBOLS,
  ...MACRO_SYMBOLS,
  ...SECTOR_SYMBOLS,
  ...MEGA_CAP,
  ...HIGH_BETA,
  ...POLICY_SYMBOLS,
  ...WATCHLIST_SYMBOLS,
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  shortName: string;
  open: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  marketCap: number;
}

export interface DiscoveryContract {
  symbol: string;
  contractSymbol: string;
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number | null;
  theta: number | null;
  spreadPercent: number;
  breakeven: number;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  rrRatio: number;
  aiScore: number;
  scoreBreakdown: ScoreBreakdown;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  action: 'enter' | 'watch' | 'skip';
  reason: string;
  category: 'short-term' | 'long-term';
  underlyingPrice: number;
}

interface ScoreBreakdown {
  technicals: number;
  flow: number;
  momentum: number;
  macro: number;
  sector: number;
  futures: number;
  liquidity: number;
  riskReward: number;
  smartMoney: number;
  crowdSaturation: number;
}

export type MoverClassification = 'Momentum Buy' | 'Pullback Buy' | 'Breakout Watch' | 'Extended / Wait' | 'Avoid';

export interface Mover {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  relativeStrength: number; // vs SPY on same day
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  // Classification fields
  classification: MoverClassification;
  classificationReason: string;
  preferredEntry: string;
  stopLossNote: string;
  rrNote: string;
  vwapEstimate: number;
  distanceFromVwapPct: number;
  distanceFromVwapATR: number;
  atrEstimate: number;
  // Validation
  hasConflict: boolean;
  conflictNote: string;
}

export interface MarketTruth {
  score: number; // 0-100, >60 bullish, <40 bearish
  biasScore: number; // new: -7 to +4 (sum of directional signals)
  confidence: number; // 0-100 percent
  label: 'Strongly Bullish' | 'Bullish' | 'Mixed' | 'Bearish' | 'Strongly Bearish';
  futuresBias: 'bullish' | 'bearish' | 'mixed';
  futuresConfirmed: boolean;
  vixLevel: number;
  vixWarning: boolean;
  spyChange: number;
  qqChange: number;
  esChange: number;
  nqChange: number;
  ymChange: number;
  rtyChange: number;
  dxyChange: number;
  tenYieldChange: number;
  oilChange: number;
  goldChange: number;
  warnings: string[];
  drivers: string[];
  risks: string[];
}

export interface PolicyWatchlistItem {
  symbol: string;
  shortName: string;
  theme: string;
  themeLabel: string;
  price: number;
  change: number;
  changePercent: number;
  rationale: string;
  disclosure: string;
  dataAge: string;
}

export interface AvoidSignal {
  symbol: string;
  reason: string;
  severity: 'warning' | 'critical';
}

export interface TradeDiscoveryResponse {
  success: boolean;
  marketTruth: MarketTruth;
  topMovers: Mover[];
  unusualVolume: Mover[];
  shortTermContracts: DiscoveryContract[];
  longTermContracts: DiscoveryContract[];
  bestRR: DiscoveryContract[];
  avoidSignals: AvoidSignal[];
  policyWatchlist: PolicyWatchlistItem[];
  dataWarnings: string[];
  meta: {
    dataSource: string;
    fetchedAt: string;
    symbolsScanned: number;
    contractsScored: number;
    delayNote: string;
  };
}

// ─── Policy Watchlist (static themes with tickers) ───────────────────────────
// All data is from Yahoo Finance public market data only.
// No nonpublic insider information. Themes based on publicly reported policy analysis.

const POLICY_THEMES: Array<{
  symbol: string;
  theme: string;
  themeLabel: string;
  rationale: string;
  disclosure: string;
}> = [
  { symbol: 'LMT', theme: 'defense', themeLabel: 'Defense & Military', rationale: 'US defense spending expansion; F-35, hypersonics, AI-driven warfare contracts publicly reported', disclosure: 'Based on public DoD contracts and Congressional appropriations' },
  { symbol: 'RTX', theme: 'defense', themeLabel: 'Defense & Military', rationale: 'Raytheon missiles, Pratt & Whitney engines — NATO and US Army expansion', disclosure: 'Based on public DoD contracts' },
  { symbol: 'NOC', theme: 'defense', themeLabel: 'Defense & Military', rationale: 'B-21 Raider bomber, space systems, cyber contracts', disclosure: 'Based on public DoD and USAF contracts' },
  { symbol: 'GD', theme: 'defense', themeLabel: 'Defense & Military', rationale: 'Gulfstream, submarines, Abrams tanks — all public government contracts', disclosure: 'Based on public DoD awards' },
  { symbol: 'AXON', theme: 'border', themeLabel: 'Border & Law Enforcement', rationale: 'Tasers, body cameras, digital evidence systems for law enforcement', disclosure: 'Based on public law enforcement contracts and earnings' },
  { symbol: 'GEO', theme: 'border', themeLabel: 'Border & Detention', rationale: 'Private detention facility operator; historically benefits from immigration enforcement increases', disclosure: 'Based on public ICE contract data and SEC filings' },
  { symbol: 'NVDA', theme: 'ai', themeLabel: 'AI Infrastructure', rationale: 'Data center GPUs, AI training chips — publicly announced government and enterprise contracts', disclosure: 'Based on public earnings reports and government AI initiatives' },
  { symbol: 'ORCL', theme: 'ai', themeLabel: 'AI Infrastructure', rationale: 'Government cloud contracts, DoD AI initiatives publicly reported', disclosure: 'Based on public DoD and government cloud contract awards' },
  { symbol: 'SMCI', theme: 'ai', themeLabel: 'AI Infrastructure', rationale: 'AI server hardware, data center infrastructure', disclosure: 'Based on public earnings and sector reports' },
  { symbol: 'XOM', theme: 'energy', themeLabel: 'Energy & Fossil Fuels', rationale: 'Drill baby drill rhetoric; LNG expansion, deregulation tailwinds publicly discussed', disclosure: 'Based on public energy policy announcements and company filings' },
  { symbol: 'CVX', theme: 'energy', themeLabel: 'Energy & Fossil Fuels', rationale: 'Permian Basin expansion, Gulf of Mexico drilling permits', disclosure: 'Based on public energy policy and SEC filings' },
  { symbol: 'COIN', theme: 'crypto', themeLabel: 'Crypto & Digital Assets', rationale: 'Pro-crypto regulatory environment; Bitcoin ETF flows, strategic reserve discussion', disclosure: 'Based on public regulatory filings and Congressional hearings' },
  { symbol: 'MSTR', theme: 'crypto', themeLabel: 'Crypto & Digital Assets', rationale: 'Bitcoin treasury company; leveraged BTC exposure', disclosure: 'Based on public SEC filings and Bitcoin reserve announcements' },
  { symbol: 'JPM', theme: 'banking', themeLabel: 'Banking Deregulation', rationale: 'Basel III reform rollback; lighter capital requirements publicly proposed', disclosure: 'Based on public FDIC/Fed proposals and earnings' },
  { symbol: 'CAT', theme: 'tariffs', themeLabel: 'Tariff & Infrastructure', rationale: 'Infrastructure spending, reshoring manufacturing — public policy', disclosure: 'Based on public infrastructure legislation and company filings' },
  { symbol: 'PLTR', theme: 'ai', themeLabel: 'AI Infrastructure', rationale: 'Government AI/surveillance contracts, AIP platform — publicly awarded contracts', disclosure: 'Based on public DoD/IC contracts and SEC filings' },
];

// ─── Yahoo Finance batch quote fetch ─────────────────────────────────────────

async function batchFetchQuotes(
  symbols: string[],
  session: { crumb: string; cookie: string } | null,
): Promise<Map<string, RawQuote>> {
  const result = new Map<string, RawQuote>();

  // Yahoo Finance v7/finance/quote handles batches of up to ~100 symbols
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) {
    chunks.push(symbols.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const symbolList = chunk.join(',');
      const fields = 'regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,marketCap';
      let url = `${YF_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&fields=${fields}&lang=en-US&region=US`;

      if (session?.crumb) {
        url += `&crumb=${encodeURIComponent(session.crumb)}`;
      }

      const fetchHeaders: Record<string, string> = { ...YF_HEADERS };
      if (session?.cookie) {
        fetchHeaders['Cookie'] = session.cookie;
      }

      const res = await fetch(url, { headers: fetchHeaders, cache: 'no-store' });
      if (!res.ok) continue;

      const text = await res.text();
      if (text.trimStart().startsWith('<')) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = JSON.parse(text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotes: any[] = json?.quoteResponse?.result ?? [];

      for (const q of quotes) {
        const price = (q.regularMarketPrice ?? 0) as number;
        const change = (q.regularMarketChange ?? 0) as number;
        result.set(q.symbol as string, {
          symbol: q.symbol as string,
          price,
          change,
          changePercent: (q.regularMarketChangePercent ?? 0) as number,
          volume: (q.regularMarketVolume ?? 0) as number,
          avgVolume: (q.averageDailyVolume3Month ?? 0) as number,
          fiftyTwoWeekHigh: (q.fiftyTwoWeekHigh ?? 0) as number,
          fiftyTwoWeekLow: (q.fiftyTwoWeekLow ?? 0) as number,
          shortName: (q.shortName ?? q.symbol) as string,
          open: (q.regularMarketOpen ?? price) as number,
          regularMarketOpen: (q.regularMarketOpen ?? price) as number,
          regularMarketDayHigh: (q.regularMarketDayHigh ?? price) as number,
          regularMarketDayLow: (q.regularMarketDayLow ?? price) as number,
          marketCap: (q.marketCap ?? 0) as number,
        });
      }
    } catch {
      // continue with partial results
    }
  }

  return result;
}

// ─── Market Truth Computation ─────────────────────────────────────────────────

function computeMarketTruth(quotes: Map<string, RawQuote>): MarketTruth {
  const es = quotes.get('ES=F');
  const nq = quotes.get('NQ=F');
  const ym = quotes.get('YM=F');
  const rty = quotes.get('RTY=F');
  const spy = quotes.get('SPY');
  const qq = quotes.get('QQQ');
  const vix = quotes.get('^VIX');
  const dxy = quotes.get('DX=F');
  const tenY = quotes.get('^TNX');
  const oil = quotes.get('CL=F');
  const gold = quotes.get('GC=F');

  const esChange = es?.changePercent ?? 0;
  const nqChange = nq?.changePercent ?? 0;
  const ymChange = ym?.changePercent ?? 0;
  const rtyChange = rty?.changePercent ?? 0;
  const spyChange = spy?.changePercent ?? 0;
  const qqChange = qq?.changePercent ?? 0;
  const vixLevel = vix?.price ?? 20;
  const vixChange = vix?.changePercent ?? 0;
  const dxyChange = dxy?.changePercent ?? 0;
  const tenYieldChange = tenY?.changePercent ?? 0;
  const oilChange = oil?.changePercent ?? 0;
  const goldChange = gold?.changePercent ?? 0;

  // ── New bias scoring system ──────────────────────────────────────────────
  // +1 per green future, -1 per risk factor
  let biasScore = 0;
  const drivers: string[] = [];
  const risks: string[] = [];

  if (esChange > 0)  { biasScore += 1; drivers.push('ES Green'); }
  else if (esChange < 0) { biasScore -= 1; risks.push('ES Red'); }

  if (nqChange > 0)  { biasScore += 1; drivers.push('NQ Green'); }
  else if (nqChange < 0) { biasScore -= 1; risks.push('NQ Red'); }

  if (ymChange > 0)  { biasScore += 1; drivers.push('YM Green'); }
  else if (ymChange < 0) { biasScore -= 1; risks.push('YM Red'); }

  if (rtyChange > 0) { biasScore += 1; drivers.push('RTY Green — Breadth Positive'); }
  else if (rtyChange < 0) { biasScore -= 1; risks.push('RTY Red — Breadth Negative'); }

  if (vixChange > 2)  { biasScore -= 1; risks.push('VIX Rising'); }
  else if (vixChange < -2) { drivers.push('VIX Falling'); }

  if (dxyChange > 0.5)    { biasScore -= 1; risks.push('DXY Rising'); }
  else if (dxyChange < -0.5) { drivers.push('DXY Falling'); }

  if (tenYieldChange > 0.5)    { biasScore -= 1; risks.push('10Y Yield Rising'); }
  else if (tenYieldChange < -0.5) { drivers.push('10Y Yield Falling'); }

  if (oilChange < -1.5) { risks.push('Oil Weak'); }
  else if (oilChange > 1.5) { risks.push('Oil Rising — Cost Pressure'); }

  if (goldChange > 1)  { risks.push('Gold Rising — Flight to Safety'); }

  // Confidence: ratio of aligned signals to total active signals
  const totalActive = drivers.length + risks.length;
  const dominantCount = biasScore >= 0 ? drivers.length : risks.length;
  const baseConfidence = totalActive > 0 ? (dominantCount / totalActive) * 100 : 50;
  const biasBoost = Math.min(20, Math.abs(biasScore) * 4);
  const confidence = Math.min(98, Math.max(30, Math.round(baseConfidence + biasBoost)));

  // Determine futuresBias from the 4 index futures
  const futuresPositive = [esChange > 0, nqChange > 0, ymChange > 0, rtyChange > 0].filter(Boolean).length;
  const futuresNegative = 4 - futuresPositive;
  const futuresBias: 'bullish' | 'bearish' | 'mixed' =
    futuresPositive >= 3 ? 'bullish' :
    futuresNegative >= 3 ? 'bearish' : 'mixed';

  // Confirmation: futures bias aligns with equity direction
  const equityBullish = spyChange > 0 && qqChange > 0;
  const equityBearish = spyChange < 0 && qqChange < 0;
  const futuresConfirmed = (futuresBias === 'bullish' && equityBullish) || (futuresBias === 'bearish' && equityBearish);

  const warnings: string[] = [];

  if (futuresBias === 'bearish' && equityBullish) {
    warnings.push('Futures red but equities green — divergence detected, elevated risk for longs');
  }
  if (futuresBias === 'bullish' && equityBearish) {
    warnings.push('Futures green but equities lagging — wait for equity confirmation');
  }
  if (vixLevel > 25 && futuresBias === 'bearish') {
    warnings.push(`VIX ${vixLevel.toFixed(1)} + futures red — elevated volatility, tread carefully`);
  }
  if (vixChange > 10) {
    warnings.push(`VIX spiking +${vixChange.toFixed(1)}% — fear rising sharply`);
  }
  if (dxyChange > 0.5 && esChange > 0) {
    warnings.push('DXY rising alongside equities — watch for reversal pressure');
  }
  if (!es && !nq) {
    warnings.push('Futures data unavailable — bias based on equities only');
  }

  const vixWarning = vixLevel > 25 || vixChange > 8;

  // Legacy 0-100 score for backwards-compatible UI elements
  let score = 50;
  score += biasScore * 8;
  if (vixLevel < 15) score += 5;
  else if (vixLevel > 30) score -= 10;
  else if (vixLevel > 25) score -= 5;
  score = Math.max(0, Math.min(100, score));

  // Apply divergence penalty to score
  if (futuresBias === 'bearish' && equityBullish) score = Math.min(score, 45);
  if (vixLevel > 25 && futuresBias === 'bearish') score = Math.min(score, 38);

  let label: MarketTruth['label'];
  if (biasScore >= 3)       label = score >= 70 ? 'Strongly Bullish' : 'Bullish';
  else if (biasScore <= -3) label = score <= 30 ? 'Strongly Bearish' : 'Bearish';
  else                      label = 'Mixed';

  return {
    score,
    biasScore,
    confidence,
    label,
    futuresBias,
    futuresConfirmed,
    vixLevel,
    vixWarning,
    spyChange,
    qqChange,
    esChange,
    nqChange,
    ymChange,
    rtyChange,
    dxyChange,
    tenYieldChange,
    oilChange,
    goldChange,
    warnings,
    drivers,
    risks,
  };
}

// ─── Mover Classification ─────────────────────────────────────────────────────

function classifyMover(
  q: RawQuote,
  relativeStrength: number,
  volumeRatio: number,
): {
  classification: MoverClassification;
  reason: string;
  preferredEntry: string;
  stopLossNote: string;
  rrNote: string;
  vwapEstimate: number;
  distanceFromVwapPct: number;
  distanceFromVwapATR: number;
  atrEstimate: number;
} {
  const { price, regularMarketOpen: open, regularMarketDayHigh: high, regularMarketDayLow: low, changePercent } = q;

  // Intraday VWAP approximation: (High + Low + Close + Open) / 4
  const vwapEstimate = (high + low + price + open) / 4;

  // ATR approximation using day's range (floor at 0.5% of price to avoid division issues)
  const atrEstimate = Math.max(high - low, price * 0.005);

  // Distance from VWAP
  const distanceFromVwapPct = vwapEstimate > 0 ? ((price - vwapEstimate) / vwapEstimate) * 100 : 0;
  const distanceFromVwapATR = atrEstimate > 0 ? (price - vwapEstimate) / atrEstimate : 0;

  const isExtendedIntraday = Math.abs(changePercent) > 5;
  const isExtendedFromVwap = Math.abs(distanceFromVwapATR) > 2;

  // Extended / Wait: big move OR too far from VWAP
  if (isExtendedIntraday || isExtendedFromVwap) {
    const reasons: string[] = [];
    if (isExtendedIntraday) reasons.push(`${Math.abs(changePercent).toFixed(1)}% intraday move`);
    if (isExtendedFromVwap) reasons.push(`${Math.abs(distanceFromVwapATR).toFixed(1)} ATR from VWAP`);
    return {
      classification: 'Extended / Wait',
      reason: reasons.join(', ') + ' — risk/reward deteriorated',
      preferredEntry: `Pullback to ${changePercent > 0 ? '9 EMA or VWAP' : 'VWAP or 9 EMA'}`,
      stopLossNote: 'Below VWAP',
      rrNote: 'Wait for pullback',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  // Avoid: weak RS, weak volume, or bearish structure
  const isWeakRS = relativeStrength < -1;
  const isWeakVolume = volumeRatio < 0.8 && changePercent < 0;
  const isBearishStructure = changePercent < -3 && relativeStrength < 0;
  const isVeryWeakRS = relativeStrength < -3;

  if (isVeryWeakRS || isBearishStructure || (isWeakRS && isWeakVolume)) {
    const reasons: string[] = [];
    if (isWeakRS || isVeryWeakRS) reasons.push('weak relative strength');
    if (isWeakVolume) reasons.push('below-average volume');
    if (isBearishStructure) reasons.push('bearish structure');
    return {
      classification: 'Avoid',
      reason: reasons.join(', '),
      preferredEntry: 'N/A — Avoid',
      stopLossNote: 'N/A',
      rrNote: 'N/A',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  // Momentum Buy: strong RS + volume + within 2 ATR of VWAP
  const isMomentumBuy = relativeStrength > 3 && volumeRatio >= 1.2 && Math.abs(distanceFromVwapATR) <= 2;
  if (isMomentumBuy) {
    return {
      classification: 'Momentum Buy',
      reason: `RS +${relativeStrength.toFixed(1)}% vs SPY, ${volumeRatio.toFixed(1)}x avg volume`,
      preferredEntry: `Current or pullback to $${vwapEstimate.toFixed(2)}`,
      stopLossNote: `Below VWAP ($${vwapEstimate.toFixed(2)})`,
      rrNote: '2:1+',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  // Pullback Buy: positive RS, positive change, close to VWAP
  const isPullbackBuy = relativeStrength > 0 && changePercent > 0 && Math.abs(distanceFromVwapPct) < 1.5;
  if (isPullbackBuy) {
    return {
      classification: 'Pullback Buy',
      reason: 'Pulling into VWAP — potential continuation setup',
      preferredEntry: `VWAP ($${vwapEstimate.toFixed(2)}) or 9 EMA`,
      stopLossNote: 'Below VWAP',
      rrNote: '2:1+',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  // Breakout Watch: volume picking up, moderate RS, not overextended
  const isBreakoutWatch = volumeRatio >= 1.2 && relativeStrength >= 0 && Math.abs(changePercent) < 4;
  if (isBreakoutWatch) {
    return {
      classification: 'Breakout Watch',
      reason: `${volumeRatio.toFixed(1)}x volume, consolidating near resistance`,
      preferredEntry: `Break above recent high`,
      stopLossNote: `Below VWAP ($${vwapEstimate.toFixed(2)})`,
      rrNote: '2:1+',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  // Default: Breakout Watch for positive movers, Avoid for negative
  if (changePercent < -1.5 && relativeStrength < 0) {
    return {
      classification: 'Avoid',
      reason: 'Negative price action with weak relative strength',
      preferredEntry: 'N/A — Avoid',
      stopLossNote: 'N/A',
      rrNote: 'N/A',
      vwapEstimate,
      distanceFromVwapPct,
      distanceFromVwapATR,
      atrEstimate,
    };
  }

  return {
    classification: 'Breakout Watch',
    reason: 'Monitoring for cleaner setup',
    preferredEntry: `Above $${(price * 1.01).toFixed(2)}`,
    stopLossNote: `Below VWAP ($${vwapEstimate.toFixed(2)})`,
    rrNote: '2:1+',
    vwapEstimate,
    distanceFromVwapPct,
    distanceFromVwapATR,
    atrEstimate,
  };
}

// ─── Mover Detection ─────────────────────────────────────────────────────────

function detectMovers(
  quotes: Map<string, RawQuote>,
  symbols: string[],
  spyChange: number,
): { movers: Mover[]; unusualVolume: Mover[] } {
  const movers: Mover[] = [];
  const unusualVolume: Mover[] = [];

  for (const sym of symbols) {
    const q = quotes.get(sym);
    if (!q || q.price <= 0) continue;

    const volumeRatio = q.avgVolume > 0 ? q.volume / q.avgVolume : 0;
    const relativeStrength = q.changePercent - spyChange;

    const classData = classifyMover(q, relativeStrength, volumeRatio);

    const mover: Mover = {
      symbol: sym,
      shortName: q.shortName,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      volume: q.volume,
      avgVolume: q.avgVolume,
      volumeRatio,
      relativeStrength,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      classification: classData.classification,
      classificationReason: classData.reason,
      preferredEntry: classData.preferredEntry,
      stopLossNote: classData.stopLossNote,
      rrNote: classData.rrNote,
      vwapEstimate: Math.round(classData.vwapEstimate * 100) / 100,
      distanceFromVwapPct: Math.round(classData.distanceFromVwapPct * 10) / 10,
      distanceFromVwapATR: Math.round(classData.distanceFromVwapATR * 10) / 10,
      atrEstimate: Math.round(classData.atrEstimate * 100) / 100,
      hasConflict: false,
      conflictNote: '',
    };

    if (Math.abs(q.changePercent) >= 1.5) {
      movers.push(mover);
    }

    if (volumeRatio >= 2.0 && q.volume > 100_000) {
      unusualVolume.push({ ...mover });
    }
  }

  movers.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  unusualVolume.sort((a, b) => b.volumeRatio - a.volumeRatio);

  return {
    movers: movers.slice(0, 10),
    unusualVolume: unusualVolume.slice(0, 10),
  };
}

// ─── Contract Scoring ─────────────────────────────────────────────────────────

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function scoreContract(
  contract: OptionContract,
  symbol: string,
  underlyingPrice: number,
  stockChangePercent: number,
  spyChange: number,
  marketTruth: MarketTruth,
  sectorChange: number,
): DiscoveryContract | null {
  const mid = contract.mid ?? contract.ask;
  if (!mid || mid <= 0) return null;
  if (contract.volume <= 0 && contract.openInterest <= 0) return null;

  const { type, strike, dte, bid, ask, lastPrice, volume, openInterest, impliedVolatility: iv } = contract;
  const delta = contract.delta;
  const theta = contract.theta;

  // R:R
  const entryPrice = r2(ask);
  const stopLoss = r2(mid * 0.50);
  const target1 = r2(mid * 2.00);
  const target2 = r2(mid * 2.75);
  const maxLoss = r2(mid - stopLoss);
  const maxGain = r2(target1 - mid);
  const rrRatio = maxLoss > 0 ? r2(maxGain / maxLoss) : 0;

  // Spread %
  const spreadPct = ask > 0 ? ((ask - bid) / ask) * 100 : 999;

  // Breakeven
  const breakeven = type === 'call' ? r2(strike + mid) : r2(strike - mid);

  // DTE category
  const category: 'short-term' | 'long-term' = dte >= 30 ? 'long-term' : 'short-term';

  // ─ Score: 10 factors ─────────────────────────────────────────────────────

  // 1. Technicals (15 pts): RSI zone approx, price vs 52wk position
  let technicals = 8; // baseline
  const relPct = (underlyingPrice - contract.strike) / underlyingPrice;
  if (type === 'call' && stockChangePercent > 0) technicals += 4;
  if (type === 'put' && stockChangePercent < 0) technicals += 4;
  if (type === 'call' && relPct > -0.02 && relPct < 0.05) technicals += 3; // near ATM call
  if (type === 'put' && relPct < 0.02 && relPct > -0.05) technicals += 3; // near ATM put

  // 2. Flow (15 pts): volume/OI ratio
  let flow = 0;
  if (openInterest > 0) {
    const volOiRatio = volume / openInterest;
    if (volOiRatio >= 1.0) flow = 15;
    else if (volOiRatio >= 0.5) flow = 11;
    else if (volOiRatio >= 0.2) flow = 7;
    else if (volOiRatio >= 0.1) flow = 4;
    else flow = 2;
  } else if (volume > 100) {
    flow = 5;
  }

  // 3. Momentum (10 pts): stock relative strength vs SPY
  let momentum = 5;
  const rs = stockChangePercent - spyChange;
  if (type === 'call') {
    if (rs > 1.5) momentum = 10;
    else if (rs > 0.5) momentum = 8;
    else if (rs > 0) momentum = 6;
    else if (rs < -1) momentum = 1;
    else momentum = 3;
  } else {
    if (rs < -1.5) momentum = 10;
    else if (rs < -0.5) momentum = 8;
    else if (rs < 0) momentum = 6;
    else if (rs > 1) momentum = 1;
    else momentum = 3;
  }

  // 4. Macro alignment (15 pts): market truth score direction
  let macro = 7;
  const mt = marketTruth.score;
  if (type === 'call') {
    if (mt >= 65) macro = 15;
    else if (mt >= 55) macro = 11;
    else if (mt >= 45) macro = 7;
    else if (mt >= 35) macro = 3;
    else macro = 0;
  } else {
    if (mt <= 35) macro = 15;
    else if (mt <= 45) macro = 11;
    else if (mt <= 55) macro = 7;
    else if (mt <= 65) macro = 3;
    else macro = 0;
  }

  // 5. Sector strength (10 pts)
  let sector = 5;
  if (type === 'call') {
    if (sectorChange > 0.5) sector = 10;
    else if (sectorChange > 0) sector = 7;
    else if (sectorChange < -0.5) sector = 1;
    else sector = 4;
  } else {
    if (sectorChange < -0.5) sector = 10;
    else if (sectorChange < 0) sector = 7;
    else if (sectorChange > 0.5) sector = 1;
    else sector = 4;
  }

  // 6. Futures alignment (10 pts)
  let futures = 5;
  const fb = marketTruth.futuresBias;
  if (type === 'call') {
    futures = fb === 'bullish' ? 10 : fb === 'mixed' ? 5 : 0;
  } else {
    futures = fb === 'bearish' ? 10 : fb === 'mixed' ? 5 : 0;
  }
  if (!marketTruth.futuresConfirmed) futures = Math.floor(futures * 0.6);

  // 7. Liquidity (10 pts): OI, spread
  let liquidity = 0;
  if (openInterest >= 1000) liquidity += 5;
  else if (openInterest >= 500) liquidity += 4;
  else if (openInterest >= 100) liquidity += 2;
  else liquidity += 0;

  if (spreadPct < 5) liquidity += 5;
  else if (spreadPct < 10) liquidity += 3;
  else if (spreadPct < 15) liquidity += 1;

  // 8. Risk/Reward (10 pts)
  let riskReward = 0;
  if (rrRatio >= 3.0) riskReward = 10;
  else if (rrRatio >= 2.5) riskReward = 9;
  else if (rrRatio >= 2.0) riskReward = 7;
  else if (rrRatio >= 1.5) riskReward = 4;
  else if (rrRatio >= 1.0) riskReward = 2;

  // 9. Smart Money probability (8 pts): high OI with unusual options volume
  let smartMoney = 2;
  if (openInterest >= 500 && volume >= 100) {
    const unusualFlowRatio = volume / Math.max(openInterest, 1);
    if (unusualFlowRatio >= 0.5 && openInterest >= 1000) smartMoney = 8;
    else if (unusualFlowRatio >= 0.3) smartMoney = 6;
    else if (unusualFlowRatio >= 0.1) smartMoney = 4;
    else smartMoney = 2;
  }

  // 10. Crowd saturation (7 pts): penalize extremely high volume/OI (overtraded)
  let crowdSaturation = 7;
  const satRatio = openInterest > 0 ? volume / openInterest : 0;
  if (satRatio > 10) crowdSaturation = 1; // everyone's already in
  else if (satRatio > 5) crowdSaturation = 3;
  else if (satRatio > 2) crowdSaturation = 5;
  else crowdSaturation = 7;

  const scoreBreakdown: ScoreBreakdown = {
    technicals,
    flow,
    momentum,
    macro,
    sector,
    futures,
    liquidity,
    riskReward,
    smartMoney,
    crowdSaturation,
  };

  const aiScore = Math.min(100, technicals + flow + momentum + macro + sector + futures + liquidity + riskReward + smartMoney + crowdSaturation);

  // Grade
  let grade: DiscoveryContract['grade'];
  if (aiScore >= 75 && rrRatio >= 2.0 && volume >= 50 && openInterest >= 100 && spreadPct < 15) grade = 'A+';
  else if (aiScore >= 60 && rrRatio >= 1.5) grade = 'A';
  else if (aiScore >= 48) grade = 'B';
  else if (aiScore >= 35) grade = 'C';
  else grade = 'D';

  // Action
  let action: DiscoveryContract['action'];
  if (grade === 'A+' && rrRatio >= 2.0) action = 'enter';
  else if (grade === 'A' || grade === 'B') action = 'watch';
  else action = 'skip';

  // Reason string
  const reasons: string[] = [];
  if (flow >= 10) reasons.push('high options flow');
  if (momentum >= 8) reasons.push('strong momentum');
  if (macro >= 12) reasons.push('macro aligned');
  if (riskReward >= 7) reasons.push(`R:R ${rrRatio.toFixed(1)}:1`);
  if (smartMoney >= 6) reasons.push('smart money signal');
  if (liquidity <= 2) reasons.push('low liquidity');
  if (spreadPct > 12) reasons.push(`wide spread ${spreadPct.toFixed(0)}%`);
  if (macro <= 3) reasons.push('macro headwind');
  const reason = reasons.length ? reasons.join(', ') : 'standard setup';

  return {
    symbol,
    contractSymbol: contract.contractSymbol,
    type,
    strike,
    expiration: contract.expiration,
    dte,
    bid,
    ask,
    mid: r2(mid),
    lastPrice: lastPrice ?? 0,
    volume,
    openInterest,
    impliedVolatility: iv,
    delta: delta ?? null,
    theta: theta ?? null,
    spreadPercent: r2(spreadPct),
    breakeven,
    entryPrice,
    target1,
    target2,
    stopLoss,
    rrRatio,
    aiScore,
    scoreBreakdown,
    grade,
    action,
    reason,
    category,
    underlyingPrice,
  };
}

// ─── Avoid Signal Detection ───────────────────────────────────────────────────

function buildAvoidSignals(
  quotes: Map<string, RawQuote>,
  marketTruth: MarketTruth,
  contracts: DiscoveryContract[],
  movers: Mover[],
): AvoidSignal[] {
  const signals: AvoidSignal[] = [];

  // VIX too high
  if (marketTruth.vixLevel > 28) {
    signals.push({ symbol: 'VIX', reason: `VIX at ${marketTruth.vixLevel.toFixed(1)} — elevated volatility, avoid short-dated calls`, severity: 'critical' });
  }

  // Futures red + buying calls
  if (marketTruth.futuresBias === 'bearish' && marketTruth.biasScore <= -3) {
    signals.push({ symbol: 'MARKET', reason: 'Bearish futures bias confirmed — avoid long calls until futures reverse', severity: 'critical' });
  }

  // DXY risk
  if (marketTruth.dxyChange > 0.7) {
    signals.push({ symbol: 'DXY', reason: `Dollar Index rising +${marketTruth.dxyChange.toFixed(1)}% — headwind for equities and risk assets`, severity: 'warning' });
  }

  // 10Y yield pressure
  if (marketTruth.tenYieldChange > 1) {
    signals.push({ symbol: '10Y YIELD', reason: `10-Year yield rising sharply (+${marketTruth.tenYieldChange.toFixed(1)}%) — compression risk for growth/tech`, severity: 'warning' });
  }

  // Stocks with genuine AVOID classification (weak RS, weak volume, bearish structure)
  // Do NOT add stocks just because they're up big — use classification system for that
  const moverSymbolsSet = new Set(movers.map(m => m.symbol));
  const stockSymbols = [...MEGA_CAP, ...HIGH_BETA, ...POLICY_SYMBOLS];
  for (const sym of stockSymbols) {
    const q = quotes.get(sym);
    if (!q) continue;
    const spyChg = quotes.get('SPY')?.changePercent ?? 0;
    const volRatio = q.avgVolume > 0 ? q.volume / q.avgVolume : 0;
    const rs = q.changePercent - spyChg;

    // Only add to avoid signals if stock has genuinely bearish structure
    // AND it's not already a mover being tracked with "Avoid" classification
    const isBearishStructure = q.changePercent < -3 && rs < -2;
    const isVeryWeakRS = rs < -4;
    if ((isBearishStructure || isVeryWeakRS) && !moverSymbolsSet.has(sym)) {
      signals.push({
        symbol: sym,
        reason: `Bearish structure: ${q.changePercent.toFixed(1)}% intraday, RS ${rs.toFixed(1)}% vs SPY`,
        severity: 'warning',
      });
    }
  }

  // Wide spread contracts
  for (const c of contracts) {
    if (c.spreadPercent > 20 && c.grade !== 'D') {
      signals.push({ symbol: `${c.symbol} ${c.strike}${c.type === 'call' ? 'C' : 'P'}`, reason: `Bid/ask spread ${c.spreadPercent.toFixed(0)}% — fill risk is too high`, severity: 'warning' });
    }
  }

  // Always-on earnings reminder
  signals.push({ symbol: 'EARNINGS', reason: 'Always verify earnings dates before entering — options IV crushes post-earnings', severity: 'warning' });

  return signals.slice(0, 8);
}

// ─── Validation Engine ────────────────────────────────────────────────────────
// Ensures no stock appears simultaneously as a "Top Opportunity" and "Avoid Trade"
// without an explicit explanation.

function validateSignals(
  movers: Mover[],
  avoidSignals: AvoidSignal[],
): Mover[] {
  const avoidSymbols = new Set(avoidSignals.map(s => s.symbol.split(' ')[0]));

  return movers.map(mover => {
    const inAvoid = avoidSymbols.has(mover.symbol);

    if (!inAvoid) return mover;

    // Conflict detected: stock is in both movers and avoid signals
    if (mover.classification === 'Avoid') {
      // Already classified as Avoid in movers — consistent, just note it
      return {
        ...mover,
        hasConflict: false,
        conflictNote: '',
      };
    }

    if (mover.classification === 'Extended / Wait') {
      // Extended and also in avoid — downgrade to show both contexts
      return {
        ...mover,
        hasConflict: true,
        conflictNote: 'Also flagged in Avoid Trades — confirm structure before entry',
      };
    }

    // Momentum/Breakout but showing in avoid signals — display mixed signal warning
    return {
      ...mover,
      hasConflict: true,
      conflictNote: 'Mixed Signals — conflicting indicators detected. Verify before trading.',
    };
  });
}

// ─── Policy Watchlist Enrichment ──────────────────────────────────────────────

function buildPolicyWatchlist(quotes: Map<string, RawQuote>): PolicyWatchlistItem[] {
  const items: PolicyWatchlistItem[] = [];
  const fetchedAt = new Date();

  for (const theme of POLICY_THEMES) {
    const q = quotes.get(theme.symbol);
    if (!q) continue;

    // Show data age as "~15 min delayed" (Yahoo Finance standard)
    const dataAge = `~15-20 min delayed as of ${fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ET`;

    items.push({
      symbol: theme.symbol,
      shortName: q.shortName ?? theme.symbol,
      theme: theme.theme,
      themeLabel: theme.themeLabel,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      rationale: theme.rationale,
      disclosure: theme.disclosure,
      dataAge,
    });
  }

  return items;
}

// ─── Main GET handler ─────────────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  const fetchedAt = new Date().toISOString();

  try {
    const session = await getYahooSession().catch(() => null);
    const quotes = await batchFetchQuotes(ALL_SYMBOLS, session);

    const dataWarnings: string[] = [];
    if (quotes.size < 10) {
      dataWarnings.push('Market data fetch returned limited results — some sections may be empty');
    }

    // Market truth
    const marketTruth = computeMarketTruth(quotes);
    dataWarnings.push(...marketTruth.warnings);

    const spyChange = quotes.get('SPY')?.changePercent ?? 0;

    // Movers
    const scanSymbols = [...MEGA_CAP, ...HIGH_BETA, ...POLICY_SYMBOLS, ...WATCHLIST_SYMBOLS];
    const { movers, unusualVolume } = detectMovers(quotes, scanSymbols, spyChange);

    // Top candidates for options scanning: unusual movers + high-beta + policy tickers
    const candidateSymbols = [
      ...movers.slice(0, 4).map(m => m.symbol),
      ...unusualVolume.slice(0, 2).map(m => m.symbol),
      'SPY', 'QQQ', 'NVDA', 'TSLA',
    ].filter((s, i, arr) => arr.indexOf(s) === i).slice(0, 8); // max 8 unique symbols

    // Fetch options chains for top candidates
    const allContracts: DiscoveryContract[] = [];
    let contractsScored = 0;

    await Promise.allSettled(
      candidateSymbols.map(async (sym) => {
        try {
          const chain = await fetchYahooOptionsChain(sym);
          if (!chain.calls.length && !chain.puts.length) return;

          const q = quotes.get(sym);
          const stockChange = q?.changePercent ?? 0;
          const underlyingPrice = chain.underlyingPrice ?? q?.price ?? 0;

          // Determine sector ETF for this symbol
          let sectorSym = 'SPY';
          if (['AAPL', 'MSFT', 'NVDA', 'AVGO', 'AMD', 'ORCL', 'SMCI', 'PLTR', 'AI', 'IONQ', 'PANW'].includes(sym)) sectorSym = 'XLK';
          else if (['XOM', 'CVX', 'COP'].includes(sym)) sectorSym = 'XLE';
          else if (['JPM', 'BAC', 'GS', 'C'].includes(sym)) sectorSym = 'XLF';
          else if (['UNH', 'HCA', 'IBB'].includes(sym)) sectorSym = 'XLV';
          else if (['AMZN', 'TSLA', 'COST', 'WMT', 'TGT'].includes(sym)) sectorSym = 'XLY';
          else if (['CAT', 'DE', 'NUE'].includes(sym)) sectorSym = 'XLI';
          const sectorChange = quotes.get(sectorSym)?.changePercent ?? 0;

          // Select best-suited expiries: 2 near-term + 1 mid-term
          const expiryDates = chain.expirationDates.slice(0, 4);
          const relevantDates = expiryDates.length > 0 ? expiryDates : [''];

          for (const dateStr of relevantDates.slice(0, 3)) {
            let calls = chain.calls;
            let puts = chain.puts;

            // Filter to relevant expiry if we have dates
            if (dateStr) {
              calls = calls.filter(c => c.expiration === dateStr);
              puts = puts.filter(c => c.expiration === dateStr);
            }

            // Only score near-to-at-money contracts (within 10% of spot)
            const nearMoneyCalls = calls
              .filter(c => c.strike >= underlyingPrice * 0.92 && c.strike <= underlyingPrice * 1.10)
              .filter(c => c.ask > 0 && c.openInterest > 0);
            const nearMoneyPuts = puts
              .filter(c => c.strike >= underlyingPrice * 0.90 && c.strike <= underlyingPrice * 1.08)
              .filter(c => c.ask > 0 && c.openInterest > 0);

            for (const contract of [...nearMoneyCalls.slice(0, 5), ...nearMoneyPuts.slice(0, 5)]) {
              contractsScored++;
              const scored = scoreContract(contract, sym, underlyingPrice, stockChange, spyChange, marketTruth, sectorChange);
              if (scored && scored.aiScore >= 30) {
                allContracts.push(scored);
              }
            }
          }
        } catch {
          // skip failed symbols
        }
      })
    );

    // Short-term: 0-14 DTE
    const shortTermContracts = allContracts
      .filter(c => c.category === 'short-term' && c.dte >= 1 && c.dte <= 14)
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 25);

    // Long-term: 30+ DTE
    const longTermContracts = allContracts
      .filter(c => c.category === 'long-term' && c.dte >= 30)
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 25);

    // Best R:R: highest rrRatio contracts with grade A or better
    const bestRR = allContracts
      .filter(c => c.rrRatio >= 2.0 && (c.grade === 'A+' || c.grade === 'A'))
      .sort((a, b) => b.rrRatio - a.rrRatio)
      .slice(0, 10);

    // Avoid signals — pass movers so we don't double-flag stocks already classified
    const avoidSignals = buildAvoidSignals(quotes, marketTruth, allContracts, movers);

    // Validation engine: resolve conflicts between movers and avoid signals
    const validatedMovers = validateSignals(movers, avoidSignals);

    // Policy watchlist
    const policyWatchlist = buildPolicyWatchlist(quotes);

    if (allContracts.length === 0) {
      dataWarnings.push('Live contract data unavailable — do not trade from this signal. Try again during market hours.');
    }

    const response: TradeDiscoveryResponse = {
      success: true,
      marketTruth,
      topMovers: validatedMovers,
      unusualVolume,
      shortTermContracts,
      longTermContracts,
      bestRR,
      avoidSignals,
      policyWatchlist,
      dataWarnings,
      meta: {
        dataSource: 'yahoo_delayed',
        fetchedAt,
        symbolsScanned: quotes.size,
        contractsScored,
        delayNote: 'Data is ~15-20 minutes delayed. Not financial advice.',
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Trade discovery failed';
    return NextResponse.json(
      {
        success: false,
        error: message,
        marketTruth: null,
        topMovers: [],
        unusualVolume: [],
        shortTermContracts: [],
        longTermContracts: [],
        bestRR: [],
        avoidSignals: [],
        policyWatchlist: [],
        dataWarnings: ['Service temporarily unavailable — live contract data unavailable, do not trade from this signal'],
        meta: { dataSource: 'yahoo_delayed', fetchedAt, symbolsScanned: 0, contractsScored: 0, delayNote: '' },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
