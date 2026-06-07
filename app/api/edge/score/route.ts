// app/api/edge/score/route.ts
// Edge Scanner scoring pipeline — resilient to per-source API failures.

import { NextResponse } from 'next/server';
import {
  fetchKalshiSource,
  fetchPolymarketSource,
  fetchManifoldSource,
  fetchPredictItSource,
  type NormalizedMarket,
  type SourceResult,
} from '@/lib/market-fetchers';

export const runtime = 'nodejs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoredOpportunity {
  id: string;
  source: 'kalshi' | 'polymarket' | 'manifold' | 'predictit';
  sourceLabel: string;
  title: string;
  pricePct: number;
  volume: number;
  closesAt: string;
  openInterest: number;
  score: number;
  tier: 1 | 2 | 3;
  signals: string[];
  arbitrageGap: number | null;
  arbitrageSource: string | null;
  priceChange: number | null;
}

interface DebugInfo {
  sources: {
    kalshi: { fetched: number; scored: number; rejected: number; error: string | null; active: boolean };
    polymarket: { fetched: number; scored: number; rejected: number; error: string | null; active: boolean };
    manifold: { fetched: number; scored: number; rejected: number; error: string | null; active: boolean };
    predictit: { fetched: number; scored: number; rejected: number; error: string | null; active: boolean };
  };
  thresholdMode: 'normal' | 'adaptive';
  scoreFloor: number;
  tier1Min: number;
  tier2Min: number;
  totalFetched: number;
  totalScored: number;
  totalRejected: number;
  cacheAge: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL = 300_000; // 5 minutes

let cachedOpportunities: ScoredOpportunity[] | null = null;
let cacheTimestamp = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  tokA.forEach(t => { if (tokB.has(t)) intersection++; });
  const union = tokA.size + tokB.size - intersection;
  return intersection / union;
}

function sourceLabel(src: NormalizedMarket['source']): string {
  return { kalshi: 'Kalshi', polymarket: 'Polymarket', manifold: 'Manifold', predictit: 'PredictIt' }[src];
}

// ─── Scoring modules (7 signals) ─────────────────────────────────────────────

// 1. Extreme probability — near certainty or near impossible (mispricing risk)
function scoreExtremeProbability(m: NormalizedMarket): { pts: number; signal: string | null } {
  if (m.pricePct >= 90) return { pts: 8, signal: `High conviction ${m.pricePct.toFixed(0)}% YES` };
  if (m.pricePct <= 10) return { pts: 8, signal: `High conviction ${m.pricePct.toFixed(0)}% NO` };
  return { pts: 0, signal: null };
}

// 2. Near-50 uncertainty premium
function scoreUncertainty(m: NormalizedMarket): { pts: number; signal: string | null } {
  const dist = Math.abs(m.pricePct - 50);
  if (dist <= 5) return { pts: 10, signal: `Near-coinflip (${m.pricePct.toFixed(0)}%)` };
  if (dist <= 15) return { pts: 5, signal: `Contested probability (${m.pricePct.toFixed(0)}%)` };
  return { pts: 0, signal: null };
}

// 3. High volume signal
function scoreVolume(m: NormalizedMarket): { pts: number; signal: string | null } {
  if (m.volume >= 1_000_000) return { pts: 12, signal: `High volume $${(m.volume / 1e6).toFixed(1)}M` };
  if (m.volume >= 100_000) return { pts: 7, signal: `Volume $${(m.volume / 1e3).toFixed(0)}K` };
  if (m.volume >= 10_000) return { pts: 3, signal: `Volume $${(m.volume / 1e3).toFixed(0)}K` };
  return { pts: 0, signal: null };
}

// 4. Wide bid-ask spread opportunity
function scoreBidAskSpread(m: NormalizedMarket): { pts: number; signal: string | null } {
  const spread = m.yesAsk - m.yesBid;
  if (m.yesBid === 0 && m.yesAsk === 0) return { pts: 0, signal: null };
  if (spread >= 10) return { pts: 12, signal: `Wide spread ${spread.toFixed(0)}¢` };
  if (spread >= 5) return { pts: 6, signal: `Spread ${spread.toFixed(0)}¢` };
  return { pts: 0, signal: null };
}

// 5. Time decay — closes soon
function scoreTimeDecay(m: NormalizedMarket): { pts: number; signal: string | null } {
  const msLeft = new Date(m.closesAt).getTime() - Date.now();
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  if (daysLeft <= 1) return { pts: 15, signal: `Closes in <1 day` };
  if (daysLeft <= 7) return { pts: 8, signal: `Closes in ${Math.ceil(daysLeft)}d` };
  if (daysLeft <= 30) return { pts: 3, signal: `Closes in ${Math.ceil(daysLeft)}d` };
  return { pts: 0, signal: null };
}

// 6. Open interest depth
function scoreOpenInterest(m: NormalizedMarket): { pts: number; signal: string | null } {
  if (m.openInterest >= 500_000) return { pts: 10, signal: `OI $${(m.openInterest / 1e6).toFixed(1)}M` };
  if (m.openInterest >= 50_000) return { pts: 5, signal: `OI $${(m.openInterest / 1e3).toFixed(0)}K` };
  return { pts: 0, signal: null };
}

// 7. Price edge — asymmetric payoff based on price
function scorePriceEdge(m: NormalizedMarket): { pts: number; signal: string | null } {
  // If YES is cheap (<20%), you risk little for large gain
  if (m.pricePct > 0 && m.pricePct < 20) {
    const payoff = (100 - m.pricePct) / m.pricePct;
    if (payoff >= 4) return { pts: 10, signal: `${payoff.toFixed(1)}x YES payoff` };
    if (payoff >= 2) return { pts: 5, signal: `${payoff.toFixed(1)}x YES payoff` };
  }
  // If NO is cheap (<20%), mirror
  if (m.pricePct < 100 && m.pricePct > 80) {
    const noPrice = 100 - m.pricePct;
    const payoff = (100 - noPrice) / noPrice;
    if (payoff >= 4) return { pts: 10, signal: `${payoff.toFixed(1)}x NO payoff` };
    if (payoff >= 2) return { pts: 5, signal: `${payoff.toFixed(1)}x NO payoff` };
  }
  return { pts: 0, signal: null };
}

function scoreMarket(m: NormalizedMarket): { score: number; signals: string[] } {
  const modules = [
    scoreExtremeProbability(m),
    scoreUncertainty(m),
    scoreVolume(m),
    scoreBidAskSpread(m),
    scoreTimeDecay(m),
    scoreOpenInterest(m),
    scorePriceEdge(m),
  ];
  const score = modules.reduce((s, x) => s + x.pts, 0);
  const signals = modules.map(x => x.signal).filter((s): s is string => s !== null);
  return { score: Math.min(score, 100), signals };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();
  const cacheAge = cachedOpportunities ? now - cacheTimestamp : 0;

  // Fetch all 4 sources in parallel
  const [kalshi, polymarket, manifold, predictit] = await Promise.all([
    fetchKalshiSource(),
    fetchPolymarketSource(),
    fetchManifoldSource(),
    fetchPredictItSource(),
  ]);

  const results: SourceResult[] = [kalshi, polymarket, manifold, predictit];
  const activeSources = results.filter(r => r.markets.length > 0).length;
  const allFailed = activeSources === 0;

  // If all sources failed and we have a fresh-ish cache, return it
  if (allFailed && cachedOpportunities) {
    const debug = buildDebug(kalshi, polymarket, manifold, predictit, 4, 30, 15, cacheAge, 'normal');
    return NextResponse.json({
      opportunities: cachedOpportunities,
      debug,
      fromCache: true,
      cacheAge,
    });
  }

  // If all sources failed and no cache, return empty with error
  if (allFailed) {
    const debug = buildDebug(kalshi, polymarket, manifold, predictit, 4, 30, 15, 0, 'normal');
    return NextResponse.json({ opportunities: [], debug, fetchFailed: true });
  }

  // Adaptive thresholds
  let scoreFloor: number;
  let tier1Min: number;
  let tier2Min: number;
  let thresholdMode: 'normal' | 'adaptive';

  if (activeSources === 1) {
    scoreFloor = 2; tier1Min = 20; tier2Min = 10; thresholdMode = 'adaptive';
  } else {
    scoreFloor = 4; tier1Min = 30; tier2Min = 15; thresholdMode = 'normal';
  }

  // Combine all markets
  const allMarkets = results.flatMap(r => r.markets);

  // Score all markets
  const scored: ScoredOpportunity[] = [];

  for (const m of allMarkets) {
    const { score, signals } = scoreMarket(m);
    if (score < scoreFloor) continue;

    // Cross-source arbitrage: find best Jaccard match from another source
    let arbitrageGap: number | null = null;
    let arbitrageSource: string | null = null;
    let bestSim = 0.35;

    for (const other of allMarkets) {
      if (other.source === m.source || other.id === m.id) continue;
      const sim = jaccardSimilarity(m.title, other.title);
      if (sim >= bestSim) {
        const gap = Math.abs(m.pricePct - other.pricePct);
        if (gap > (arbitrageGap ?? 0)) {
          bestSim = sim;
          arbitrageGap = gap;
          arbitrageSource = sourceLabel(other.source);
        }
      }
    }

    const tier: 1 | 2 | 3 = score >= tier1Min ? 1 : score >= tier2Min ? 2 : 3;

    scored.push({
      id: m.id,
      source: m.source,
      sourceLabel: sourceLabel(m.source),
      title: m.title,
      pricePct: m.pricePct,
      volume: m.volume,
      closesAt: m.closesAt,
      openInterest: m.openInterest,
      score,
      tier,
      signals,
      arbitrageGap,
      arbitrageSource,
      priceChange: null, // populated client-side via localStorage
    });
  }

  // Sort by score desc
  scored.sort((a, b) => b.score - a.score);

  // Build per-source debug counts
  const sourceScored: Record<string, number> = { kalshi: 0, polymarket: 0, manifold: 0, predictit: 0 };
  for (const o of scored) sourceScored[o.source]++;

  // Cache result
  cachedOpportunities = scored;
  cacheTimestamp = now;

  const debug = buildDebug(kalshi, polymarket, manifold, predictit, scoreFloor, tier1Min, tier2Min, 0, thresholdMode, sourceScored);

  return NextResponse.json({ opportunities: scored, debug });
}

function buildDebug(
  kalshi: SourceResult,
  polymarket: SourceResult,
  manifold: SourceResult,
  predictit: SourceResult,
  scoreFloor: number,
  tier1Min: number,
  tier2Min: number,
  cacheAge: number,
  thresholdMode: 'normal' | 'adaptive',
  scored: Record<string, number> = {},
): DebugInfo {
  function sourceStat(r: SourceResult) {
    const s = scored[r.source] ?? 0;
    return {
      fetched: r.fetched,
      scored: s,
      rejected: r.markets.length - s,
      error: r.error,
      active: r.markets.length > 0,
    };
  }

  const totalFetched = kalshi.fetched + polymarket.fetched + manifold.fetched + predictit.fetched;
  const totalScored = Object.values(scored).reduce((a, b) => a + b, 0);

  return {
    sources: {
      kalshi: sourceStat(kalshi),
      polymarket: sourceStat(polymarket),
      manifold: sourceStat(manifold),
      predictit: sourceStat(predictit),
    },
    thresholdMode,
    scoreFloor,
    tier1Min,
    tier2Min,
    totalFetched,
    totalScored,
    totalRejected: totalFetched - totalScored,
    cacheAge,
  };
}
