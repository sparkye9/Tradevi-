// lib/market-fetchers.ts
// Shared data layer for prediction market sources with 5-minute TTL caching.

export interface NormalizedMarket {
  id: string;
  source: 'kalshi' | 'polymarket' | 'manifold' | 'predictit';
  title: string;
  pricePct: number;      // 0–100, YES implied probability
  volume: number;
  closesAt: string;      // ISO string
  openInterest: number;
  yesBid: number;        // 0 if unavailable
  yesAsk: number;
  noBid: number;
  noAsk: number;
}

export interface SourceResult {
  source: 'kalshi' | 'polymarket' | 'manifold' | 'predictit';
  markets: NormalizedMarket[];
  fetched: number;       // raw count before filtering
  error: string | null;
  fetchedAt: number;     // Date.now()
}

const CACHE_TTL = 300_000; // 5 minutes

// ─── Module-level caches ──────────────────────────────────────────────────────

let kalshiCache: SourceResult | null = null;
let polymarketCache: SourceResult | null = null;
let manifoldCache: SourceResult | null = null;
let predictitCache: SourceResult | null = null;

function isFresh(result: SourceResult | null): boolean {
  return result !== null && Date.now() - result.fetchedAt < CACHE_TTL;
}

// ─── Kalshi ──────────────────────────────────────────────────────────────────

export async function fetchKalshiSource(): Promise<SourceResult> {
  if (isFresh(kalshiCache)) return kalshiCache!;

  const source = 'kalshi' as const;
  try {
    const allRaw: unknown[] = [];
    let cursor: string | null = null;
    let pages = 0;
    const MAX_PAGES = 10; // up to 2000 markets (200 * 10)

    do {
      const url = new URL('https://api.elections.kalshi.com/trade-api/v2/markets');
      url.searchParams.set('status', 'open');
      url.searchParams.set('limit', '200');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 },
      });

      if (!res.ok) throw new Error(`Kalshi HTTP ${res.status}`);

      const data = await res.json() as {
        markets?: unknown[];
        cursor?: string | null;
      };

      const batch = data.markets ?? [];
      allRaw.push(...batch);
      cursor = data.cursor ?? null;
      pages++;

      if (batch.length < 200) break;
    } while (cursor && pages < MAX_PAGES);

    const fetched = allRaw.length;
    const markets: NormalizedMarket[] = [];

    for (const raw of allRaw) {
      const m = raw as Record<string, unknown>;
      if (m.status !== 'open') continue;

      const yesBid = typeof m.yes_bid === 'number' ? m.yes_bid : 0;
      const yesAsk = typeof m.yes_ask === 'number' ? m.yes_ask : 0;
      const noBid = typeof m.no_bid === 'number' ? m.no_bid : 0;
      const noAsk = typeof m.no_ask === 'number' ? m.no_ask : 0;
      const lastPrice = typeof m.last_price === 'number' ? m.last_price : null;

      let pricePct: number;
      if (yesBid > 0 && yesAsk > 0) {
        pricePct = ((yesBid + yesAsk) / 2) * 100;
      } else if (lastPrice !== null) {
        pricePct = lastPrice * 100;
      } else {
        continue; // skip: no price
      }

      const closesAt = typeof m.close_time === 'string'
        ? m.close_time
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      markets.push({
        id: String(m.ticker ?? m.id ?? ''),
        source,
        title: String(m.title ?? ''),
        pricePct,
        volume: typeof m.volume === 'number' ? m.volume : 0,
        closesAt,
        openInterest: typeof m.open_interest === 'number' ? m.open_interest : 0,
        yesBid: yesBid * 100,
        yesAsk: yesAsk * 100,
        noBid: noBid * 100,
        noAsk: noAsk * 100,
      });
    }

    kalshiCache = { source, markets, fetched, error: null, fetchedAt: Date.now() };
    return kalshiCache;
  } catch (err) {
    const result: SourceResult = {
      source,
      markets: kalshiCache?.markets ?? [],
      fetched: 0,
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: Date.now(),
    };
    kalshiCache = result;
    return result;
  }
}

// ─── Polymarket ───────────────────────────────────────────────────────────────

export async function fetchPolymarketSource(): Promise<SourceResult> {
  if (isFresh(polymarketCache)) return polymarketCache!;

  const source = 'polymarket' as const;
  try {
    const res = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=500',
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 0 } },
    );
    if (!res.ok) throw new Error(`Polymarket HTTP ${res.status}`);

    const data = await res.json() as unknown[];
    const fetched = data.length;
    const markets: NormalizedMarket[] = [];

    for (const raw of data) {
      const m = raw as Record<string, unknown>;
      const outcomePrices = m.outcomePrices;
      if (!Array.isArray(outcomePrices) || outcomePrices.length !== 2) continue;

      const pricePct = parseFloat(String(outcomePrices[0])) * 100;
      if (isNaN(pricePct)) continue;

      const closesAt = typeof m.endDate === 'string'
        ? m.endDate
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      markets.push({
        id: String(m.id ?? ''),
        source,
        title: String(m.question ?? m.title ?? ''),
        pricePct,
        volume: typeof m.volume === 'number' ? m.volume : parseFloat(String(m.volume ?? '0')) || 0,
        closesAt,
        openInterest: typeof m.liquidity === 'number'
          ? m.liquidity
          : parseFloat(String(m.liquidity ?? '0')) || 0,
        yesBid: 0,
        yesAsk: 0,
        noBid: 0,
        noAsk: 0,
      });
    }

    polymarketCache = { source, markets, fetched, error: null, fetchedAt: Date.now() };
    return polymarketCache;
  } catch (err) {
    const result: SourceResult = {
      source,
      markets: polymarketCache?.markets ?? [],
      fetched: 0,
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: Date.now(),
    };
    polymarketCache = result;
    return result;
  }
}

// ─── Manifold ─────────────────────────────────────────────────────────────────

export async function fetchManifoldSource(): Promise<SourceResult> {
  if (isFresh(manifoldCache)) return manifoldCache!;

  const source = 'manifold' as const;
  try {
    const res = await fetch(
      'https://api.manifold.markets/v0/markets?limit=500&sort=liquidity&order=desc',
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 0 } },
    );
    if (!res.ok) throw new Error(`Manifold HTTP ${res.status}`);

    const data = await res.json() as unknown[];
    const fetched = data.length;
    const markets: NormalizedMarket[] = [];

    for (const raw of data) {
      const m = raw as Record<string, unknown>;
      if (m.outcomeType !== 'BINARY') continue;
      if (m.isResolved === true) continue;

      const prob = typeof m.probability === 'number' ? m.probability : 0.5;
      const pricePct = prob * 100;

      let closesAt: string;
      if (typeof m.closeTime === 'number') {
        closesAt = new Date(m.closeTime).toISOString();
      } else if (typeof m.closeTime === 'string') {
        closesAt = m.closeTime;
      } else {
        closesAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      markets.push({
        id: String(m.id ?? ''),
        source,
        title: String(m.question ?? ''),
        pricePct,
        volume: typeof m.totalLiquidity === 'number' ? m.totalLiquidity : 0,
        closesAt,
        openInterest: 0,
        yesBid: 0,
        yesAsk: 0,
        noBid: 0,
        noAsk: 0,
      });
    }

    manifoldCache = { source, markets, fetched, error: null, fetchedAt: Date.now() };
    return manifoldCache;
  } catch (err) {
    const result: SourceResult = {
      source,
      markets: manifoldCache?.markets ?? [],
      fetched: 0,
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: Date.now(),
    };
    manifoldCache = result;
    return result;
  }
}

// ─── PredictIt ────────────────────────────────────────────────────────────────

export async function fetchPredictItSource(): Promise<SourceResult> {
  if (isFresh(predictitCache)) return predictitCache!;

  const source = 'predictit' as const;
  try {
    const res = await fetch(
      'https://www.predictit.org/api/marketdata/all/',
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 0 } },
    );
    if (!res.ok) throw new Error(`PredictIt HTTP ${res.status}`);

    const data = await res.json() as { markets?: unknown[] };
    const rawMarkets = data.markets ?? [];
    let fetched = 0;
    const markets: NormalizedMarket[] = [];

    for (const raw of rawMarkets) {
      const mkt = raw as Record<string, unknown>;
      const contracts = Array.isArray(mkt.contracts) ? mkt.contracts as Record<string, unknown>[] : [];
      fetched += contracts.length;

      for (const contract of contracts) {
        const lastTrade = typeof contract.lastTradePrice === 'number' ? contract.lastTradePrice : 0.5;
        const pricePct = lastTrade * 100;

        const closesAt = typeof mkt.end === 'string' && mkt.end
          ? mkt.end
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const yesAsk = typeof contract.bestBuyYesCost === 'number' ? contract.bestBuyYesCost * 100 : 0;
        const noAsk = typeof contract.bestBuyNoCost === 'number' ? contract.bestBuyNoCost * 100 : 0;

        const contractName = typeof contract.name === 'string' ? contract.name : String(contract.id ?? '');
        const marketName = typeof mkt.name === 'string' ? mkt.name : String(mkt.id ?? '');

        markets.push({
          id: `${mkt.id}_${contract.id}`,
          source,
          title: `${marketName}: ${contractName}`,
          pricePct,
          volume: typeof contract.volume === 'number' ? contract.volume : 0,
          closesAt,
          openInterest: 0,
          yesBid: 0,
          yesAsk,
          noBid: 0,
          noAsk,
        });
      }
    }

    predictitCache = { source, markets, fetched, error: null, fetchedAt: Date.now() };
    return predictitCache;
  } catch (err) {
    const result: SourceResult = {
      source,
      markets: predictitCache?.markets ?? [],
      fetched: 0,
      error: err instanceof Error ? err.message : String(err),
      fetchedAt: Date.now(),
    };
    predictitCache = result;
    return result;
  }
}
