/**
 * Security master for Tradevi's curated stock universe.
 *
 * Two layers of validation, never one:
 *  1. This reviewed registry: lifecycle events (delisting, rename, merger)
 *     confirmed from a primary source, with the date and the citation.
 *  2. A runtime check on every quote (lib/marketData/freshness.ts): the
 *     listing venue must be known and on the US equity calendar, and the
 *     last-trade timestamp must be within the configured limits for the
 *     current session. A symbol that is not in the inactive list is NOT
 *     assumed active — it still has to pass (2).
 *
 * A missing quote is never treated as proof of delisting (it may be an
 * outage). Only a reviewed lifecycle record marks a symbol DELISTED.
 *
 * Maintenance: lifecycle records are edited by a person after reading the
 * primary source — successors are never swapped in automatically.
 */
import type { CanonicalExchange } from './exchanges';

export type AssetClass = 'equity' | 'adr' | 'etf';

export type LifecycleStatus = 'delisted' | 'acquired' | 'merged' | 'renamed' | 'suspended';

export interface Successor {
  symbol: string;
  name: string;
  exchange: CanonicalExchange;
  /**
   * True only when a primary source confirms the successor is the same
   * issuer AND the same share class (e.g. a pure ticker rename with an
   * unchanged CUSIP). A merger successor is a different security.
   */
  sameSecurity: boolean;
  note: string;
}

export interface LifecycleRecord {
  symbol: string;
  name: string;
  formerExchange: CanonicalExchange;
  status: LifecycleStatus;
  /** Date the event took effect (YYYY-MM-DD). */
  effective: string;
  detail: string;
  source: string;
  successor?: Successor;
}

/**
 * Reviewed lifecycle events. Reviewed on 2026-10-15.
 * These symbols are excluded from every actionable scan but stay valid in
 * the journal and backtests (historical trades on them were real).
 */
export const LIFECYCLE: LifecycleRecord[] = [
  {
    symbol: 'EA',
    name: 'Electronic Arts Inc.',
    formerExchange: 'NASDAQ',
    status: 'acquired',
    effective: '2026-08-04',
    detail: 'Taken private by a PIF / Silver Lake / Affinity Partners consortium ($210 cash per share). Shares ceased trading and were removed from Nasdaq.',
    source: 'Company / press reports of deal close, 2026-08-04 (e.g. gameinformer.com 2026-08-04)',
  },
  {
    symbol: 'TWTR',
    name: 'Twitter, Inc.',
    formerExchange: 'NYSE',
    status: 'acquired',
    effective: '2022-10-27',
    detail: 'Acquired by X Holdings (Elon Musk) for $54.20 cash per share; NYSE delisted the shares in November 2022.',
    source: 'Twitter Form 25 / NYSE notice, October–November 2022',
  },
  {
    symbol: 'PARA',
    name: 'Paramount Global Class B',
    formerExchange: 'NASDAQ',
    status: 'merged',
    effective: '2025-08-07',
    detail: 'Merged with Skydance Media. PARA and PARAA stopped trading at closing; options delisted 2025-08-08.',
    source: 'Paramount / Skydance closing announcement, 2025-08-07 (Reuters, Variety)',
    successor: {
      symbol: 'PSKY',
      name: 'Paramount Skydance Corporation Class B',
      exchange: 'NASDAQ',
      sameSecurity: false,
      note: 'New combined company after a merger with a cash election — a different security, not a rename. Add PSKY to a watchlist yourself if you want it scanned.',
    },
  },
  {
    symbol: 'SQ',
    name: 'Block, Inc. Class A',
    formerExchange: 'NYSE',
    status: 'renamed',
    effective: '2025-01-21',
    detail: 'Ticker changed from SQ to XYZ on the NYSE. Same issuer, same Class A shares, CUSIP unchanged.',
    source: 'Block, Inc. press release "Block Announces Ticker Symbol Change to XYZ", 2025-01-09',
    successor: {
      symbol: 'XYZ',
      name: 'Block, Inc. Class A',
      exchange: 'NYSE',
      sameSecurity: true,
      note: 'Company-confirmed rename with unchanged CUSIP. XYZ was added to the curated list by review, not automatically.',
    },
  },
  {
    symbol: 'EXAS',
    name: 'Exact Sciences Corporation',
    formerExchange: 'NASDAQ',
    status: 'acquired',
    effective: '2026-03-23',
    detail: 'Acquired by Abbott for $105.00 cash per share. Last day of trading on Nasdaq was 2026-03-20.',
    source: 'Abbott press release "Abbott completes acquisition of Exact Sciences", 2026-03-23',
  },
];

const LIFECYCLE_BY_SYMBOL = new Map(LIFECYCLE.map((r) => [r.symbol, r]));

export function lifecycleFor(symbol: string): LifecycleRecord | null {
  return LIFECYCLE_BY_SYMBOL.get(symbol.toUpperCase()) ?? null;
}

/** True when a reviewed record says the symbol no longer trades under this ticker. */
export function isInactive(symbol: string): boolean {
  return LIFECYCLE_BY_SYMBOL.has(symbol.toUpperCase());
}

export interface CuratedSecurity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /**
   * Primary listing venue as last reviewed. null when the venue changed
   * recently or was not confirmed — the provider-reported venue decides.
   * A provider venue that disagrees with a non-null value blocks signals
   * until a person reviews it.
   */
  expectedExchange: CanonicalExchange | null;
  group: string;
}

function g(group: string, rows: [string, string, AssetClass, CanonicalExchange | null][]): CuratedSecurity[] {
  return rows.map(([symbol, name, assetClass, expectedExchange]) => ({ symbol, name, assetClass, expectedExchange, group }));
}

/**
 * The curated scan list. This is a hand-picked list of ~110 liquid US
 * names — NOT the whole market. The UI labels it "Curated list".
 */
export const CURATED_UNIVERSE: CuratedSecurity[] = [
  ...g('Mega cap tech', [
    ['AAPL', 'Apple Inc.', 'equity', 'NASDAQ'],
    ['MSFT', 'Microsoft Corporation', 'equity', 'NASDAQ'],
    ['NVDA', 'NVIDIA Corporation', 'equity', 'NASDAQ'],
    ['GOOGL', 'Alphabet Inc. Class A', 'equity', 'NASDAQ'],
    ['META', 'Meta Platforms, Inc.', 'equity', 'NASDAQ'],
    ['AMZN', 'Amazon.com, Inc.', 'equity', 'NASDAQ'],
    ['TSLA', 'Tesla, Inc.', 'equity', 'NASDAQ'],
    ['AMD', 'Advanced Micro Devices, Inc.', 'equity', 'NASDAQ'],
    ['INTC', 'Intel Corporation', 'equity', 'NASDAQ'],
    ['QCOM', 'QUALCOMM Incorporated', 'equity', 'NASDAQ'],
  ]),
  ...g('Finance', [
    ['JPM', 'JPMorgan Chase & Co.', 'equity', 'NYSE'],
    ['BAC', 'Bank of America Corporation', 'equity', 'NYSE'],
    ['GS', 'The Goldman Sachs Group, Inc.', 'equity', 'NYSE'],
    ['MS', 'Morgan Stanley', 'equity', 'NYSE'],
    ['WFC', 'Wells Fargo & Company', 'equity', 'NYSE'],
    ['V', 'Visa Inc. Class A', 'equity', 'NYSE'],
    ['MA', 'Mastercard Incorporated Class A', 'equity', 'NYSE'],
    ['AXP', 'American Express Company', 'equity', 'NYSE'],
    ['C', 'Citigroup Inc.', 'equity', 'NYSE'],
    ['SCHW', 'The Charles Schwab Corporation', 'equity', 'NYSE'],
  ]),
  ...g('Healthcare', [
    ['JNJ', 'Johnson & Johnson', 'equity', 'NYSE'],
    ['UNH', 'UnitedHealth Group Incorporated', 'equity', 'NYSE'],
    ['PFE', 'Pfizer Inc.', 'equity', 'NYSE'],
    ['ABBV', 'AbbVie Inc.', 'equity', 'NYSE'],
    ['MRK', 'Merck & Co., Inc.', 'equity', 'NYSE'],
    ['LLY', 'Eli Lilly and Company', 'equity', 'NYSE'],
    ['MRNA', 'Moderna, Inc.', 'equity', 'NASDAQ'],
    ['BNTX', 'BioNTech SE ADS', 'adr', 'NASDAQ'],
    ['BIIB', 'Biogen Inc.', 'equity', 'NASDAQ'],
    ['GILD', 'Gilead Sciences, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('Consumer', [
    // Walmart announced a listing transfer to Nasdaq in late 2025 — venue left to the provider.
    ['WMT', 'Walmart Inc.', 'equity', null],
    ['COST', 'Costco Wholesale Corporation', 'equity', 'NASDAQ'],
    ['HD', 'The Home Depot, Inc.', 'equity', 'NYSE'],
    ['NKE', 'NIKE, Inc. Class B', 'equity', 'NYSE'],
    ['MCD', "McDonald's Corporation", 'equity', 'NYSE'],
    ['SBUX', 'Starbucks Corporation', 'equity', 'NASDAQ'],
    ['TGT', 'Target Corporation', 'equity', 'NYSE'],
    ['LOW', "Lowe's Companies, Inc.", 'equity', 'NYSE'],
    ['ETSY', 'Etsy, Inc.', 'equity', null],
  ]),
  ...g('Energy', [
    ['XOM', 'Exxon Mobil Corporation', 'equity', 'NYSE'],
    ['CVX', 'Chevron Corporation', 'equity', 'NYSE'],
    ['COP', 'ConocoPhillips', 'equity', 'NYSE'],
    ['SLB', 'SLB N.V.', 'equity', 'NYSE'],
    ['EOG', 'EOG Resources, Inc.', 'equity', 'NYSE'],
    ['MPC', 'Marathon Petroleum Corporation', 'equity', 'NYSE'],
    ['VLO', 'Valero Energy Corporation', 'equity', 'NYSE'],
    ['HAL', 'Halliburton Company', 'equity', 'NYSE'],
    ['OXY', 'Occidental Petroleum Corporation', 'equity', 'NYSE'],
    ['DVN', 'Devon Energy Corporation', 'equity', 'NYSE'],
  ]),
  ...g('ETFs', [
    ['SPY', 'SPDR S&P 500 ETF Trust', 'etf', 'NYSE_ARCA'],
    ['QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ'],
    ['IWM', 'iShares Russell 2000 ETF', 'etf', 'NYSE_ARCA'],
    ['DIA', 'SPDR Dow Jones Industrial Average ETF', 'etf', 'NYSE_ARCA'],
    ['XLK', 'Technology Select Sector SPDR Fund', 'etf', 'NYSE_ARCA'],
    ['XLF', 'Financial Select Sector SPDR Fund', 'etf', 'NYSE_ARCA'],
    ['XLV', 'Health Care Select Sector SPDR Fund', 'etf', 'NYSE_ARCA'],
    ['XLE', 'Energy Select Sector SPDR Fund', 'etf', 'NYSE_ARCA'],
    ['XLY', 'Consumer Discretionary Select Sector SPDR Fund', 'etf', 'NYSE_ARCA'],
    ['GLD', 'SPDR Gold Shares', 'etf', 'NYSE_ARCA'],
  ]),
  ...g('High momentum / growth', [
    // Shopify moved its US listing to Nasdaq in 2025 — venue left to the provider.
    ['SHOP', 'Shopify Inc. Class A', 'equity', null],
    ['PLTR', 'Palantir Technologies Inc.', 'equity', 'NASDAQ'],
    ['SNOW', 'Snowflake Inc.', 'equity', 'NYSE'],
    ['CRWD', 'CrowdStrike Holdings, Inc.', 'equity', 'NASDAQ'],
    ['NET', 'Cloudflare, Inc.', 'equity', 'NYSE'],
    ['DDOG', 'Datadog, Inc.', 'equity', 'NASDAQ'],
    ['PANW', 'Palo Alto Networks, Inc.', 'equity', 'NASDAQ'],
    ['ZS', 'Zscaler, Inc.', 'equity', 'NASDAQ'],
    ['COIN', 'Coinbase Global, Inc.', 'equity', 'NASDAQ'],
    ['HOOD', 'Robinhood Markets, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('Entertainment / media', [
    ['NFLX', 'Netflix, Inc.', 'equity', 'NASDAQ'],
    ['DIS', 'The Walt Disney Company', 'equity', 'NYSE'],
    ['SPOT', 'Spotify Technology S.A.', 'equity', 'NYSE'],
    ['RBLX', 'Roblox Corporation', 'equity', 'NYSE'],
    ['TTWO', 'Take-Two Interactive Software, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('EV / clean energy', [
    ['RIVN', 'Rivian Automotive, Inc.', 'equity', 'NASDAQ'],
    ['LCID', 'Lucid Group, Inc.', 'equity', 'NASDAQ'],
    ['NIO', 'NIO Inc. ADS', 'adr', 'NYSE'],
    ['XPEV', 'XPeng Inc. ADS', 'adr', 'NYSE'],
    ['LI', 'Li Auto Inc. ADS', 'adr', 'NASDAQ'],
    ['CHPT', 'ChargePoint Holdings, Inc.', 'equity', 'NYSE'],
    ['BLNK', 'Blink Charging Co.', 'equity', 'NASDAQ'],
    ['PLUG', 'Plug Power Inc.', 'equity', 'NASDAQ'],
    ['FCEL', 'FuelCell Energy, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('Crypto / fintech', [
    ['MARA', 'MARA Holdings, Inc.', 'equity', 'NASDAQ'],
    ['RIOT', 'Riot Platforms, Inc.', 'equity', 'NASDAQ'],
    ['CLSK', 'CleanSpark, Inc.', 'equity', 'NASDAQ'],
    ['MSTR', 'Strategy Inc Class A', 'equity', 'NASDAQ'],
    ['HUT', 'Hut 8 Corp.', 'equity', 'NASDAQ'],
    ['SOFI', 'SoFi Technologies, Inc.', 'equity', 'NASDAQ'],
    ['AFRM', 'Affirm Holdings, Inc.', 'equity', 'NASDAQ'],
    ['UPST', 'Upstart Holdings, Inc.', 'equity', 'NASDAQ'],
    ['XYZ', 'Block, Inc. Class A', 'equity', 'NYSE'],
    ['PYPL', 'PayPal Holdings, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('Biotech / speculative', [
    ['SAVA', 'Cassava Sciences, Inc.', 'equity', 'NASDAQ'],
    ['NVAX', 'Novavax, Inc.', 'equity', 'NASDAQ'],
    ['SRPT', 'Sarepta Therapeutics, Inc.', 'equity', 'NASDAQ'],
    ['ACAD', 'ACADIA Pharmaceuticals Inc.', 'equity', 'NASDAQ'],
    ['RCUS', 'Arcus Biosciences, Inc.', 'equity', 'NYSE'],
    ['ARWR', 'Arrowhead Pharmaceuticals, Inc.', 'equity', 'NASDAQ'],
    ['FATE', 'Fate Therapeutics, Inc.', 'equity', 'NASDAQ'],
  ]),
  ...g('Small/mid cap momentum', [
    ['DKNG', 'DraftKings Inc. Class A', 'equity', 'NASDAQ'],
    ['PENN', 'PENN Entertainment, Inc.', 'equity', 'NASDAQ'],
    ['IONQ', 'IonQ, Inc.', 'equity', 'NYSE'],
    ['SOUN', 'SoundHound AI, Inc. Class A', 'equity', 'NASDAQ'],
    ['AI', 'C3.ai, Inc. Class A', 'equity', 'NYSE'],
    ['BBAI', 'BigBear.ai Holdings, Inc.', 'equity', 'NYSE'],
    ['RCAT', 'Red Cat Holdings, Inc.', 'equity', 'NASDAQ'],
    ['SMCI', 'Super Micro Computer, Inc.', 'equity', 'NASDAQ'],
    ['CLOV', 'Clover Health Investments, Corp. Class A', 'equity', 'NASDAQ'],
    ['FUTU', 'Futu Holdings Limited ADS', 'adr', 'NASDAQ'],
  ]),
  ...g('Other high-liquidity', [
    ['UBER', 'Uber Technologies, Inc.', 'equity', 'NYSE'],
    ['LYFT', 'Lyft, Inc. Class A', 'equity', 'NASDAQ'],
    ['SNAP', 'Snap Inc. Class A', 'equity', 'NYSE'],
    ['PINS', 'Pinterest, Inc. Class A', 'equity', 'NYSE'],
    ['BABA', 'Alibaba Group Holding Limited ADS', 'adr', 'NYSE'],
    ['JD', 'JD.com, Inc. ADS', 'adr', 'NASDAQ'],
    ['PDD', 'PDD Holdings Inc. ADS', 'adr', 'NASDAQ'],
    ['BILI', 'Bilibili Inc. ADS', 'adr', 'NASDAQ'],
  ]),
  ...g('Industrial / macro', [
    ['BA', 'The Boeing Company', 'equity', 'NYSE'],
    ['CAT', 'Caterpillar Inc.', 'equity', 'NYSE'],
    ['DE', 'Deere & Company', 'equity', 'NYSE'],
    ['GE', 'GE Aerospace', 'equity', 'NYSE'],
    ['MMM', '3M Company', 'equity', 'NYSE'],
    ['RTX', 'RTX Corporation', 'equity', 'NYSE'],
    ['LMT', 'Lockheed Martin Corporation', 'equity', 'NYSE'],
    ['NOC', 'Northrop Grumman Corporation', 'equity', 'NYSE'],
    ['F', 'Ford Motor Company', 'equity', 'NYSE'],
    ['GM', 'General Motors Company', 'equity', 'NYSE'],
  ]),
];

const CURATED_BY_SYMBOL = new Map(CURATED_UNIVERSE.map((s) => [s.symbol, s]));

export function curatedSecurity(symbol: string): CuratedSecurity | null {
  return CURATED_BY_SYMBOL.get(symbol.toUpperCase()) ?? null;
}

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** Upper-case, trim, drop malformed symbols and duplicates (first occurrence wins). */
export function normalizeSymbols(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().toUpperCase();
    if (!SYMBOL_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Split a requested list into scannable symbols and reviewed-inactive ones. */
export function partitionUniverse(input: readonly string[]): { active: string[]; inactive: LifecycleRecord[] } {
  const active: string[] = [];
  const inactive: LifecycleRecord[] = [];
  for (const s of normalizeSymbols(input)) {
    const rec = lifecycleFor(s);
    if (rec) inactive.push(rec);
    else active.push(s);
  }
  return { active, inactive };
}

/** Curated tickers for the scanner — deduplicated, with reviewed-inactive symbols removed. */
export const CURATED_TICKERS: string[] = partitionUniverse(CURATED_UNIVERSE.map((s) => s.symbol)).active;
