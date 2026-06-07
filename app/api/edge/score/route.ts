import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_bid: number;   // cents
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  open_interest: number;
  close_time: string;
  category: string;
  status: string;
}

interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string[] | string;
  volume: number;
  liquidity: number;
  endDate: string;
  tags?: { label: string }[];
}

export interface ScoredOpportunity {
  id: string;
  source: 'kalshi' | 'polymarket' | 'cross';
  title: string;
  category: string;
  currentPricePct: number;      // market's implied probability (0–100)
  fairValuePct: number;         // our estimated fair value (0–100)
  edgePct: number;              // abs(fairValue - currentPrice)
  direction: 'YES' | 'NO';      // which side has edge
  tier: 1 | 2 | 3;
  riskLevel: 'Low' | 'Medium' | 'High';
  catalyst: string;
  reasonCrowdIsWrong: string;
  suggestedEntry: string;
  suggestedExit: string;
  volume: number;
  closesAt: string;
  scores: {
    priceConflict: number;      // 0–25
    forgottenMarket: number;    // 0–20
    infoGap: number;            // 0–20
    glitch: number;             // 0–15
    overreaction: number;       // 0–10
    eventArbitrage: number;     // 0–5
    crowdEmotion: number;       // 0–5
    total: number;              // 0–100
  };
  heroType?: 'mispriced' | 'forgotten' | 'breaking' | 'wrong_crowd';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter++; });
  const union = a.size + b.size - inter;
  return inter / union;
}

function daysUntil(dateStr: string): number {
  try {
    const ms = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, ms / 86400000);
  } catch {
    return 999;
  }
}

function categoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('trump') || t.includes('biden') || t.includes('president') || t.includes('elect') || t.includes('senate') || t.includes('congress')) return 'Politics';
  if (t.includes('fed') || t.includes('rate') || t.includes('inflation') || t.includes('gdp') || t.includes('recession') || t.includes('cpi') || t.includes('fomc')) return 'Economics';
  if (t.includes('bitcoin') || t.includes('crypto') || t.includes('eth') || t.includes('btc')) return 'Crypto';
  if (t.includes('nba') || t.includes('nfl') || t.includes('mlb') || t.includes('soccer') || t.includes('champion') || t.includes('super bowl')) return 'Sports';
  if (t.includes('war') || t.includes('ukraine') || t.includes('russia') || t.includes('china') || t.includes('taiwan') || t.includes('iran')) return 'Geopolitics';
  if (t.includes('stock') || t.includes('market') || t.includes('s&p') || t.includes('nasdaq') || t.includes('dow')) return 'Finance';
  return 'Other';
}

// ─── Scoring Modules ─────────────────────────────────────────────────────────

// Module 1: Price Conflict — how far from 50% is the market + how suspicious
function scorePriceConflict(pricePct: number, volume: number): { score: number; edge: number; direction: 'YES' | 'NO' } {
  // Markets near extremes (< 15% or > 85%) where we suspect mispricing
  const distFrom50 = Math.abs(pricePct - 50);
  const distFromExtreme = Math.min(pricePct, 100 - pricePct);

  // If low volume + near extreme, crowd may be anchored wrong
  let score = 0;
  let fairValue = pricePct;

  if (distFromExtreme < 10 && volume < 5000) {
    // Very extreme low-volume market — likely mispriced
    score = 22;
    fairValue = pricePct < 50 ? Math.min(pricePct * 2.5, 30) : Math.max(100 - (100 - pricePct) * 2.5, 70);
  } else if (distFrom50 > 25 && volume < 20000) {
    // Skewed + low volume
    score = 15;
    fairValue = pricePct + (50 - pricePct) * 0.3;
  } else if (distFrom50 > 15 && volume < 50000) {
    score = 8;
    fairValue = pricePct + (50 - pricePct) * 0.15;
  } else {
    score = Math.max(0, 5 - Math.floor(volume / 100000));
    fairValue = pricePct;
  }

  const edge = Math.abs(fairValue - pricePct);
  const direction: 'YES' | 'NO' = fairValue > pricePct ? 'YES' : 'NO';
  return { score, edge, direction };
}

// Module 2: Forgotten Market — low attention + upcoming catalyst
function scoreForgottenMarket(volume: number, openInterest: number, daysLeft: number): number {
  if (volume > 100000) return 0;
  if (daysLeft > 60) return 0;

  let score = 0;
  // Low volume signal
  if (volume < 500) score += 10;
  else if (volume < 2000) score += 7;
  else if (volume < 10000) score += 4;

  // Urgency bonus — catalyst approaching
  if (daysLeft < 3) score += 8;
  else if (daysLeft < 7) score += 6;
  else if (daysLeft < 14) score += 4;
  else if (daysLeft < 30) score += 2;

  return Math.min(20, score);
}

// Module 3: Information Gap — proxy via title keyword analysis
function scoreInfoGap(title: string, volume: number): number {
  const niche = [
    'municipal', 'senate seat', 'house seat', 'governor', 'primary',
    'district', 'county', 'local', 'referendum', 'proposition',
    'central bank', 'yield curve', 'spread', 'treasury', 'auction',
    'altcoin', 'defi', 'protocol', 'fork', 'mining',
  ];
  const t = title.toLowerCase();
  const hasNiche = niche.some((kw) => t.includes(kw));
  if (!hasNiche) return volume < 1000 ? 8 : 0;
  return volume < 5000 ? 18 : volume < 20000 ? 12 : 6;
}

// Module 4: Glitch Detection — YES + NO spreads, impossible prices
function scoreGlitch(yesBid: number, yesAsk: number, noBid: number, noAsk: number): { score: number; detail: string } {
  // YES + NO should sum to ~100 cents (they're complementary)
  const midYes = (yesBid + yesAsk) / 2;
  const midNo = (noBid + noAsk) / 2;
  const sum = midYes + midNo;

  // Spread check
  const yesSpread = yesAsk - yesBid;
  const noSpread = noAsk - noBid;

  let score = 0;
  let detail = '';

  if (Math.abs(sum - 100) > 8) {
    score = 15;
    detail = `YES+NO = ${sum.toFixed(0)}¢ (should be 100¢) — pricing glitch`;
  } else if (Math.abs(sum - 100) > 4) {
    score = 8;
    detail = `YES+NO = ${sum.toFixed(0)}¢ — slight mispricing`;
  } else if (yesSpread > 15 || noSpread > 15) {
    score = 5;
    detail = `Wide spread (${yesSpread}¢ YES / ${noSpread}¢ NO) — illiquid`;
  }

  return { score, detail };
}

// Module 5: Overreaction — market moved hard recently (proxy: far from 50 + low volume = emotional)
function scoreOverreaction(pricePct: number, volume: number, daysLeft: number): number {
  const distFrom50 = Math.abs(pricePct - 50);
  if (distFrom50 < 20) return 0;
  if (volume > 50000) return 0;
  if (daysLeft > 30) return 0;
  // Extreme + low volume + near close = likely overreaction
  return Math.min(10, Math.floor(distFrom50 / 10) + (daysLeft < 7 ? 3 : 0));
}

// Module 6: Event Arbitrage — cross-market Kalshi↔Polymarket conflict
function scoreEventArbitrage(kalshiPct: number, polyPct: number): { score: number; gapPct: number } {
  const gap = Math.abs(kalshiPct - polyPct);
  if (gap > 15) return { score: 5, gapPct: gap };
  if (gap > 8) return { score: 3, gapPct: gap };
  if (gap > 4) return { score: 1, gapPct: gap };
  return { score: 0, gapPct: gap };
}

// Module 7: Crowd Emotion — certain categories at certain price levels suggest panic/euphoria
function scoreCrowdEmotion(category: string, pricePct: number, volume: number): { score: number; signal: string } {
  const isPanic = pricePct < 15 && volume < 10000;
  const isEuphoria = pricePct > 85 && volume < 10000;
  const isHotCategory = ['Politics', 'Geopolitics', 'Crypto'].includes(category);

  if (isHotCategory && (isPanic || isEuphoria)) {
    return { score: 5, signal: isPanic ? 'Crowd panic — may be overdone' : 'Crowd euphoria — may be overdone' };
  }
  if (isPanic || isEuphoria) {
    return { score: 3, signal: isPanic ? 'Extreme pessimism' : 'Extreme optimism' };
  }
  return { score: 0, signal: '' };
}

// ─── Narrative generators ─────────────────────────────────────────────────────

function buildNarrative(
  title: string,
  category: string,
  pricePct: number,
  direction: 'YES' | 'NO',
  scores: ScoredOpportunity['scores'],
  glitchDetail: string,
  emotionSignal: string,
  crossGapPct: number,
  daysLeft: number
): { catalyst: string; reason: string; entry: string; exit: string } {
  const side = direction === 'YES' ? 'YES' : 'NO';
  const oppSide = direction === 'YES' ? 'NO' : 'YES';
  const impliedOdds = direction === 'YES' ? pricePct : 100 - pricePct;

  let catalyst = '';
  let reason = '';

  if (scores.glitch > 10 && glitchDetail) {
    catalyst = 'Pricing anomaly detected';
    reason = glitchDetail;
  } else if (scores.eventArbitrage >= 4 && crossGapPct > 0) {
    catalyst = 'Cross-market price discrepancy';
    reason = `Same event priced ${crossGapPct.toFixed(0)}% differently across platforms — one is wrong`;
  } else if (scores.forgottenMarket >= 12) {
    catalyst = daysLeft < 7 ? 'Event resolving this week — market thin' : 'Upcoming catalyst with low attention';
    reason = `Low volume (overlooked) + ${daysLeft < 7 ? 'imminent resolution' : 'catalyst approaching'} — price hasn't caught up`;
  } else if (scores.overreaction >= 7) {
    catalyst = 'Recent price spike likely overdone';
    reason = `Market at ${pricePct.toFixed(0)}% — emotional pricing, historical base rate suggests different outcome`;
  } else if (scores.crowdEmotion >= 4 && emotionSignal) {
    catalyst = emotionSignal;
    reason = `${category} market in emotional phase — smart money fades extreme moves`;
  } else {
    catalyst = 'Low-attention market with upcoming resolution';
    reason = `At ${impliedOdds.toFixed(0)}¢, ${side} side appears mispriced vs. base rates`;
  }

  const entryPrice = direction === 'YES'
    ? `Buy YES below ${Math.min(pricePct + 3, 95).toFixed(0)}¢`
    : `Buy NO below ${Math.min(100 - pricePct + 3, 95).toFixed(0)}¢`;

  const targetPrice = direction === 'YES'
    ? `${Math.min(pricePct + Math.max(8, scores.total / 5), 95).toFixed(0)}¢`
    : `${Math.min(100 - pricePct + Math.max(8, scores.total / 5), 95).toFixed(0)}¢`;

  const entry = `${entryPrice} — scale in slowly`;
  const exit = `Target ${targetPrice} or close 48h before expiry`;

  return { catalyst, reason, entry, exit };
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchKalshiMarkets(): Promise<KalshiMarket[]> {
  const all: KalshiMarket[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ status: 'open', limit: '200' });
    if (cursor) params.set('cursor', cursor);
    try {
      const resp = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?${params}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) break;
      const json = await resp.json();
      const page = (json.markets ?? []).map((m: Record<string, unknown>) => ({
        ticker: String(m.ticker ?? ''),
        title: String(m.title ?? ''),
        yes_bid: m.yes_bid != null ? Number(m.yes_bid) : null,
        yes_ask: m.yes_ask != null ? Number(m.yes_ask) : null,
        no_bid: m.no_bid != null ? Number(m.no_bid) : null,
        no_ask: m.no_ask != null ? Number(m.no_ask) : null,
        volume: Number(m.volume ?? 0),
        open_interest: Number(m.open_interest ?? 0),
        close_time: String(m.close_time ?? ''),
        category: String(m.category ?? ''),
        status: String(m.status ?? ''),
      }));
      all.push(...page);
      cursor = (json.cursor as string) ?? null;
    } catch {
      break;
    }
  } while (cursor && all.length < 2000);
  return all;
}

async function fetchPolymarkets(): Promise<PolymarketMarket[]> {
  try {
    const resp = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=500',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) return [];
    const raw: PolymarketMarket[] = await resp.json();
    return raw.filter((m) => {
      try {
        const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
        return Array.isArray(prices) && prices.length === 2;
      } catch { return false; }
    });
  } catch {
    return [];
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let scoreCache: { opportunities: ScoredOpportunity[]; ts: number } | null = null;
const CACHE_TTL = 120_000;

// ─── Main Route ───────────────────────────────────────────────────────────────

export async function GET() {
  if (scoreCache && Date.now() - scoreCache.ts < CACHE_TTL) {
    return NextResponse.json({ opportunities: scoreCache.opportunities, cached: true });
  }

  const [kalshiMarkets, polyMarkets] = await Promise.all([
    fetchKalshiMarkets(),
    fetchPolymarkets(),
  ]);

  // Build Polymarket lookup by title tokens for cross-reference
  const polyTokens: Array<{ market: PolymarketMarket; tokens: Set<string>; pricePct: number }> = polyMarkets.map((m) => {
    let pricePct = 50;
    try {
      const prices = typeof m.outcomePrices === 'string'
        ? JSON.parse(m.outcomePrices)
        : m.outcomePrices;
      pricePct = parseFloat(prices[0]) * 100;
    } catch { /* use 50 */ }
    return { market: m, tokens: tokenize(m.question), pricePct };
  });

  const opportunities: ScoredOpportunity[] = [];

  // Score Kalshi markets
  for (const km of kalshiMarkets) {
    if (!km.ticker || km.status !== 'open') continue;

    const yesBid = km.yes_bid ?? 0;
    const yesAsk = km.yes_ask ?? 0;
    const noBid = km.no_bid ?? 0;
    const noAsk = km.no_ask ?? 0;
    const midYes = yesBid > 0 && yesAsk > 0 ? (yesBid + yesAsk) / 2 : 0;
    const midNo = noBid > 0 && noAsk > 0 ? (noBid + noAsk) / 2 : 0;
    // Skip markets with no tradeable price at all
    if (midYes <= 0 && midNo <= 0) continue;
    const pricePct = midYes > 0 ? midYes : 100 - midNo;
    const days = daysUntil(km.close_time);
    const category = categoryFromTitle(km.title);

    // Module 1
    const { score: pc, edge, direction } = scorePriceConflict(pricePct, km.volume);

    // Module 2
    const fm = scoreForgottenMarket(km.volume, km.open_interest, days);

    // Module 3
    const ig = scoreInfoGap(km.title, km.volume);

    // Module 4
    const { score: glitchScore, detail: glitchDetail } = scoreGlitch(yesBid, yesAsk, noBid, noAsk);

    // Module 5
    const or = scoreOverreaction(pricePct, km.volume, days);

    // Module 6 — find matching Polymarket
    const kTokens = tokenize(km.title);
    let eaScore = 0;
    let crossGapPct = 0;
    for (const p of polyTokens) {
      const sim = jaccard(kTokens, p.tokens);
      if (sim > 0.35) {
        const { score, gapPct } = scoreEventArbitrage(pricePct, p.pricePct);
        if (score > eaScore) { eaScore = score; crossGapPct = gapPct; }
        break;
      }
    }

    // Module 7
    const { score: ceScore, signal: emotionSignal } = scoreCrowdEmotion(category, pricePct, km.volume);

    const total = pc + fm + ig + glitchScore + or + eaScore + ceScore;
    if (total < 4) continue; // skip only the truly inert

    // Fair value
    const fairValuePct = direction === 'YES'
      ? Math.min(pricePct + edge, 97)
      : Math.max(pricePct - edge, 3);

    const tier: 1 | 2 | 3 = total >= 30 ? 1 : total >= 15 ? 2 : 3;
    const riskLevel: 'Low' | 'Medium' | 'High' =
      days < 3 ? 'High' : km.volume < 1000 ? 'High' : km.volume < 10000 ? 'Medium' : 'Low';

    const scores = {
      priceConflict: pc, forgottenMarket: fm, infoGap: ig,
      glitch: glitchScore, overreaction: or, eventArbitrage: eaScore,
      crowdEmotion: ceScore, total,
    };

    const { catalyst, reason, entry, exit } = buildNarrative(
      km.title, category, pricePct, direction, scores, glitchDetail, emotionSignal, crossGapPct, days
    );

    opportunities.push({
      id: km.ticker,
      source: 'kalshi',
      title: km.title,
      category,
      currentPricePct: Math.round(pricePct * 10) / 10,
      fairValuePct: Math.round(fairValuePct * 10) / 10,
      edgePct: Math.round(Math.abs(fairValuePct - pricePct) * 10) / 10,
      direction,
      tier,
      riskLevel,
      catalyst,
      reasonCrowdIsWrong: reason,
      suggestedEntry: entry,
      suggestedExit: exit,
      volume: km.volume,
      closesAt: km.close_time,
      scores,
    });
  }

  // Sort by total score descending
  opportunities.sort((a, b) => b.scores.total - a.scores.total);
  const top50 = opportunities.slice(0, 50);

  // Pick hero cards — best in each category, with sensible fallbacks
  const byPriceConflict = [...top50].sort((a, b) => b.scores.priceConflict - a.scores.priceConflict);
  const byForgotten = [...top50].sort((a, b) => b.scores.forgottenMarket - a.scores.forgottenMarket);
  const byBreaking = [...top50].sort((a, b) =>
    (b.scores.eventArbitrage + b.scores.infoGap) - (a.scores.eventArbitrage + a.scores.infoGap));
  const byWrongCrowd = [...top50].sort((a, b) =>
    (b.scores.crowdEmotion + b.scores.overreaction) - (a.scores.crowdEmotion + a.scores.overreaction));

  const used = new Set<string>();
  const pick = (sorted: ScoredOpportunity[]) => {
    const found = sorted.find((o) => !used.has(o.id));
    if (found) used.add(found.id);
    return found;
  };

  const mispriced = pick(byPriceConflict);
  const forgotten = pick(byForgotten);
  const breaking = pick(byBreaking);
  const wrongCrowd = pick(byWrongCrowd);

  if (mispriced) mispriced.heroType = 'mispriced';
  if (forgotten) forgotten.heroType = 'forgotten';
  if (breaking) breaking.heroType = 'breaking';
  if (wrongCrowd) wrongCrowd.heroType = 'wrong_crowd';

  scoreCache = { opportunities: top50, ts: Date.now() };
  return NextResponse.json({
    opportunities: top50,
    cached: false,
    meta: {
      kalshiFetched: kalshiMarkets.length,
      polymarketFetched: polyMarkets.length,
      scored: opportunities.length,
      returned: top50.length,
    },
  });
}
