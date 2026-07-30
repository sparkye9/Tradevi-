// lib/universe.ts — STEP 1 of the Opportunity Page rebuild: "scan every US
// listed stock along with ETFs, futures, indexes, and major sectors."
//
// Replaces the old hardcoded ~150-ticker MARKET_TICKERS list with a real
// scan of the Finviz Elite screener (NYSE + NASDAQ + AMEX, liquid names),
// plus the explicit index/sector/futures/macro instruments STEP 1 calls out.
// Every quote is scored with the same lib/opportunityScore.ts engine every
// other screen uses — no separate scoring path for "the universe."
//
// What this does NOT do (out of scope until a real data provider is wired
// up): dark pool prints, dealer gamma/vanna/charm, order-flow/footprint,
// insider filings, ETF flow data, or multi-year historical pattern matching
// (STEP 2 onward). Faking those numbers would be actively misleading in a
// tool people trade real money against, so they're left out rather than
// approximated.
import { fetchFinvizUniverse, fetchFinvizScreener, fetchFinvizFutures } from './finviz';
import { fetchMacroInstruments } from './macroInstruments';
import { rankByOpportunity, type ScoredQuote } from './opportunityScore';
import { loadUniverseScan, saveUniverseScan, isPersistenceConfigured } from './scanStore';
import type { FinvizQuote, FinvizFuture } from './finviz';

export const SECTOR_ETFS = ['XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLI', 'XLB', 'XLU', 'XLP', 'XLC', 'XLRE'];
export const INDEX_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA'];
export const BOND_PROXIES = ['TLT', 'IEF']; // tradeable ETF proxies alongside ZB/ZN futures
export const DOLLAR_PROXIES = ['UUP']; // tradeable ETF proxy alongside DX futures
const CONTEXT_TICKERS = [...INDEX_ETFS, ...SECTOR_ETFS, ...BOND_PROXIES, ...DOLLAR_PROXIES];

export interface UniverseContext {
  indexes: FinvizQuote[];
  sectors: FinvizQuote[];
  bonds: FinvizQuote[];
  dollar: FinvizQuote[];
  futures: FinvizFuture[]; // ES, NQ, RTY, YM, NKD, CL, GC, ZB, ZN, DX
  macro: FinvizFuture[]; // VIX, BTC, ETH
}

export interface UniverseScanResult {
  opportunities: ScoredQuote[]; // every NYSE/NASDAQ/AMEX name scanned, ranked
  context: UniverseContext;
  meta: {
    scannedCount: number;
    exchangesCovered: string[];
    cappedByPageLimit: boolean;
    asOf: string;
    sourceError?: string;
    /** 'cache' = served from the persisted daily scan; 'live' = computed this request. */
    servedFrom?: 'cache' | 'live';
    persistenceConfigured?: boolean;
  };
}

/**
 * The read path every page load hits: serve the persisted daily scan if it's
 * fresh enough, otherwise fall back to a live scan (and persist that result
 * for the next request). This is what makes the 4 AM cron actually useful —
 * without it, every page load would re-run the full screener scan itself.
 */
export async function getUniverseScan(
  rvolThreshold: number,
  opts: { maxAgeMinutes?: number } = {}
): Promise<UniverseScanResult> {
  const maxAgeMinutes = opts.maxAgeMinutes ?? 240; // 4h — generous for a once-daily scan
  const cached = await loadUniverseScan();
  if (cached) {
    const ageMinutes = (Date.now() - new Date(cached.meta.asOf).getTime()) / 60_000;
    if (ageMinutes <= maxAgeMinutes) {
      return { ...cached, meta: { ...cached.meta, servedFrom: 'cache', persistenceConfigured: isPersistenceConfigured() } };
    }
  }
  const fresh = await runUniverseScan(rvolThreshold);
  const withMeta: UniverseScanResult = {
    ...fresh,
    meta: { ...fresh.meta, servedFrom: 'live', persistenceConfigured: isPersistenceConfigured() },
  };
  await saveUniverseScan(withMeta);
  return withMeta;
}

/** The full STEP 1 scan: universe + context, scored and ranked. Always live. */
export async function runUniverseScan(rvolThreshold: number): Promise<UniverseScanResult> {
  const [universe, contextQuotes, futures, macro] = await Promise.all([
    fetchFinvizUniverse(['nyse', 'nasd', 'amex']),
    fetchFinvizScreener(CONTEXT_TICKERS),
    fetchFinvizFutures(),
    fetchMacroInstruments(),
  ]);

  const opportunities = rankByOpportunity(universe.data, rvolThreshold);

  const byTicker = (list: string[]) =>
    list
      .map((sym) => contextQuotes.data.find((q) => q.symbol === sym))
      .filter((q): q is FinvizQuote => q !== undefined);

  return {
    opportunities,
    context: {
      indexes: byTicker(INDEX_ETFS),
      sectors: byTicker(SECTOR_ETFS),
      bonds: byTicker(BOND_PROXIES),
      dollar: byTicker(DOLLAR_PROXIES),
      futures: futures.data,
      macro,
    },
    meta: {
      scannedCount: universe.scannedCount,
      exchangesCovered: universe.exchangesCovered,
      cappedByPageLimit: universe.cappedByPageLimit,
      asOf: universe.lastUpdated,
      sourceError: universe.sourceError,
    },
  };
}
