/**
 * Futures contract specifications used by the risk calculator, the backtest
 * cost model and the setup engine.
 *
 * Source: CME Group / COMEX / NYMEX / CBOT published contract specifications
 * (cmegroup.com → Markets → <product> → Contract Specs). These are the
 * exchange's *outright* minimum tick sizes. Values were entered from the
 * exchange specs and last reviewed on SPEC_REVIEWED_ON. They could not be
 * re-fetched live from the build environment. Re-check the CME page whenever
 * the exchange announces a spec change; that is rare, but it happens (ZN
 * moved to a 1/64 tick in 2023).
 *
 * `priceProxy` is the free data series the app reads for that contract's
 * price. A micro contract tracks the same index as its full-size contract, so
 * MNQ levels are read from NQ=F. The price is identical, but volume and order
 * book are the full contract's.
 */

export const SPEC_REVIEWED_ON = '2026-10-13';
export const SPEC_SOURCE = 'CME Group contract specifications (cmegroup.com)';

export type AssetClass = 'equity_index' | 'metal' | 'energy' | 'fx' | 'rates';

export interface ContractSpec {
  symbol: string;
  name: string;
  exchange: 'CME' | 'CBOT' | 'COMEX' | 'NYMEX';
  assetClass: AssetClass;
  /** Minimum price increment, in price points. */
  tickSize: number;
  /** Dollar value of one tick for one contract. */
  tickValue: number;
  /** Dollar value of a 1.00 price move (= tickValue / tickSize). */
  pointValue: number;
  /** Contract unit as the exchange states it. */
  multiplier: string;
  /** Size relationship, e.g. 'micro' contracts are 1/10 of 'standard'. */
  size: 'standard' | 'mini' | 'micro';
  /** Full-size sibling, if this is a micro or mini. */
  parent?: string;
  /** Yahoo continuous symbol the app reads for prices. */
  priceProxy: string;
  /** Decimal places needed to print a price at tick precision. */
  decimals: number;
}

function spec(s: Omit<ContractSpec, 'pointValue'>): ContractSpec {
  return { ...s, pointValue: Math.round((s.tickValue / s.tickSize) * 1e6) / 1e6 };
}

export const CONTRACTS: Record<string, ContractSpec> = Object.fromEntries(
  [
    // Equity index — CME
    spec({ symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.25, tickValue: 12.5, multiplier: '$50 × S&P 500 index', size: 'mini', priceProxy: 'ES=F', decimals: 2 }),
    spec({ symbol: 'MES', name: 'Micro E-mini S&P 500', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.25, tickValue: 1.25, multiplier: '$5 × S&P 500 index', size: 'micro', parent: 'ES', priceProxy: 'ES=F', decimals: 2 }),
    spec({ symbol: 'NQ', name: 'E-mini Nasdaq-100', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.25, tickValue: 5, multiplier: '$20 × Nasdaq-100 index', size: 'mini', priceProxy: 'NQ=F', decimals: 2 }),
    spec({ symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.25, tickValue: 0.5, multiplier: '$2 × Nasdaq-100 index', size: 'micro', parent: 'NQ', priceProxy: 'NQ=F', decimals: 2 }),
    // Equity index — CBOT
    spec({ symbol: 'YM', name: 'E-mini Dow ($5)', exchange: 'CBOT', assetClass: 'equity_index', tickSize: 1, tickValue: 5, multiplier: '$5 × DJIA', size: 'mini', priceProxy: 'YM=F', decimals: 0 }),
    spec({ symbol: 'MYM', name: 'Micro E-mini Dow', exchange: 'CBOT', assetClass: 'equity_index', tickSize: 1, tickValue: 0.5, multiplier: '$0.50 × DJIA', size: 'micro', parent: 'YM', priceProxy: 'YM=F', decimals: 0 }),
    spec({ symbol: 'RTY', name: 'E-mini Russell 2000', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.1, tickValue: 5, multiplier: '$50 × Russell 2000 index', size: 'mini', priceProxy: 'RTY=F', decimals: 1 }),
    spec({ symbol: 'M2K', name: 'Micro E-mini Russell 2000', exchange: 'CME', assetClass: 'equity_index', tickSize: 0.1, tickValue: 0.5, multiplier: '$5 × Russell 2000 index', size: 'micro', parent: 'RTY', priceProxy: 'RTY=F', decimals: 1 }),
    // Metals — COMEX
    spec({ symbol: 'GC', name: 'Gold', exchange: 'COMEX', assetClass: 'metal', tickSize: 0.1, tickValue: 10, multiplier: '100 troy oz', size: 'standard', priceProxy: 'GC=F', decimals: 1 }),
    spec({ symbol: 'MGC', name: 'Micro Gold', exchange: 'COMEX', assetClass: 'metal', tickSize: 0.1, tickValue: 1, multiplier: '10 troy oz', size: 'micro', parent: 'GC', priceProxy: 'GC=F', decimals: 1 }),
    spec({ symbol: 'SI', name: 'Silver', exchange: 'COMEX', assetClass: 'metal', tickSize: 0.005, tickValue: 25, multiplier: '5,000 troy oz', size: 'standard', priceProxy: 'SI=F', decimals: 3 }),
    spec({ symbol: 'SIL', name: 'Micro Silver (1,000 oz)', exchange: 'COMEX', assetClass: 'metal', tickSize: 0.005, tickValue: 5, multiplier: '1,000 troy oz', size: 'micro', parent: 'SI', priceProxy: 'SI=F', decimals: 3 }),
    // Energy — NYMEX
    spec({ symbol: 'CL', name: 'WTI Crude Oil', exchange: 'NYMEX', assetClass: 'energy', tickSize: 0.01, tickValue: 10, multiplier: '1,000 barrels', size: 'standard', priceProxy: 'CL=F', decimals: 2 }),
    spec({ symbol: 'MCL', name: 'Micro WTI Crude Oil', exchange: 'NYMEX', assetClass: 'energy', tickSize: 0.01, tickValue: 1, multiplier: '100 barrels', size: 'micro', parent: 'CL', priceProxy: 'CL=F', decimals: 2 }),
    spec({ symbol: 'NG', name: 'Henry Hub Natural Gas', exchange: 'NYMEX', assetClass: 'energy', tickSize: 0.001, tickValue: 10, multiplier: '10,000 MMBtu', size: 'standard', priceProxy: 'NG=F', decimals: 3 }),
    // FX — CME
    spec({ symbol: '6E', name: 'Euro FX', exchange: 'CME', assetClass: 'fx', tickSize: 0.00005, tickValue: 6.25, multiplier: '€125,000', size: 'standard', priceProxy: '6E=F', decimals: 5 }),
    spec({ symbol: 'M6E', name: 'Micro Euro FX', exchange: 'CME', assetClass: 'fx', tickSize: 0.0001, tickValue: 1.25, multiplier: '€12,500', size: 'micro', parent: '6E', priceProxy: '6E=F', decimals: 4 }),
    // Rates — CBOT
    spec({ symbol: 'ZN', name: '10-Year T-Note', exchange: 'CBOT', assetClass: 'rates', tickSize: 0.015625, tickValue: 15.625, multiplier: '$100,000 face value', size: 'standard', priceProxy: 'ZN=F', decimals: 6 }),
  ].map((c) => [c.symbol, c]),
);

export function contractSpec(symbol: string): ContractSpec | null {
  return CONTRACTS[symbol.toUpperCase()] ?? null;
}

/** Contracts offered in the risk calculator, micros first within each family. */
export const CALCULATOR_CONTRACTS = ['MNQ', 'NQ', 'MES', 'ES', 'MYM', 'YM', 'M2K', 'RTY', 'MGC', 'GC', 'SIL', 'SI', 'MCL', 'CL', 'NG', 'M6E', '6E', 'ZN'];

/** Round a price to the nearest valid tick (half away from zero), integer tick math. */
export function roundToTick(price: number, tickSize: number): number {
  const ticks = Math.round(price / tickSize);
  return Number((ticks * tickSize).toFixed(10));
}

/** Format a price at the contract's tick precision. */
export function formatPrice(price: number | null, c: ContractSpec | null): string {
  if (price == null || !Number.isFinite(price)) return '—';
  return price.toFixed(c ? Math.min(c.decimals, 6) : 2);
}
