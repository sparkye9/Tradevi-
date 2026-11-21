/**
 * Every tunable number in Crash Intelligence lives here, documented in
 * docs/CRASH_INTELLIGENCE.md. These are starting values chosen by judgment,
 * not fitted probabilities; the Historical Crash Simulator is where they are
 * tested (in-sample years only), and its out-of-sample years are never used
 * to pick them.
 */

export type CategoryId = 'breadth' | 'technical' | 'volatility' | 'credit' | 'macro';

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  breadth: 'Market breadth',
  technical: 'Price structure',
  volatility: 'Volatility & skew',
  credit: 'Credit & financial stress',
  macro: 'Macro & liquidity',
};

export const CATEGORY_ORDER: CategoryId[] = ['breadth', 'technical', 'volatility', 'credit', 'macro'];

export interface RiskConfig {
  /** Category weights; they need not sum to 100, the score is normalised. */
  weights: Record<CategoryId, number>;
  /** A category whose cluster coverage is below this share is "insufficient data" and left out of the score. */
  minCategoryCoverage: number;
  /** Score bands (lower bounds). */
  bands: { early: number; elevated: number; high: number; severe: number };
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  weights: { breadth: 20, technical: 20, volatility: 20, credit: 20, macro: 20 },
  minCategoryCoverage: 0.5,
  bands: { early: 20, elevated: 40, high: 60, severe: 80 },
};

export interface RegimeConfig {
  /** PANIC / LATE ENTRY: VIX at or above this level… */
  panicVix: number;
  /** …or VIX in this top share of its trailing 1-year range with an inverted term structure. */
  panicVixPercentile: number;
  /** VOLATILITY EXPANSION: VIX up at least this much over 10 sessions (decimal)… */
  expansionVixChange10d: number;
  /** …and at least this level. */
  expansionMinVix: number;
  /** VIX / VIX3M at or above this counts as term-structure inversion. */
  inversionRatio: number;
  /** BREAKDOWN CONFIRMED: SPY drawdown from its 52-week high at least this (decimal). */
  breakdownDrawdown: number;
  /** PRE-CRASH WATCH: category risk (0–1) that counts as "deteriorating". */
  deterioratingCategoryRisk: number;
  /** …how many independent non-volatility categories must be deteriorating. */
  preCrashMinCategories: number;
  /** …while VIX is at or below this level, or its 1-year percentile at or below `subduedVixPercentile`. */
  subduedVix: number;
  subduedVixPercentile: number;
  /** …and SPY is still within this drawdown of its high (no breakdown yet). */
  preCrashMaxDrawdown: number;
}

export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  panicVix: 35,
  panicVixPercentile: 0.95,
  expansionVixChange10d: 0.4,
  expansionMinVix: 20,
  inversionRatio: 1.0,
  breakdownDrawdown: 0.1,
  deterioratingCategoryRisk: 0.45,
  preCrashMinCategories: 3,
  subduedVix: 20,
  subduedVixPercentile: 0.5,
  preCrashMaxDrawdown: 0.07,
};

/** Put Hunter screening defaults (the "initial filters" from the spec; all adjustable in the UI). */
export interface ScreenFilters {
  minPremium: number;
  maxPremium: number;
  minDte: number;
  maxDte: number;
  minAbsDelta: number;
  maxAbsDelta: number;
  minOpenInterest: number;
  minVolume: number;
  /** (ask − bid) / mid, decimal. */
  maxSpreadPct: number;
  /** Greeks older than this many minutes during the regular session make a contract stale. */
  maxGreeksAgeMin: number;
}

export const SHORT_TERM_FILTERS: ScreenFilters = {
  minPremium: 0.05,
  maxPremium: 0.5,
  minDte: 14,
  maxDte: 60,
  minAbsDelta: 0.1,
  maxAbsDelta: 0.36,
  minOpenInterest: 100,
  minVolume: 10,
  maxSpreadPct: 0.25,
  maxGreeksAgeMin: 90,
};

export const LONG_TERM_FILTERS: ScreenFilters = {
  ...SHORT_TERM_FILTERS,
  minPremium: 0.05,
  maxPremium: 3,
  minDte: 60,
  maxDte: 120,
};

/** LEAPS window for the long-term Setups view (no premium cap by default). */
export const LEAPS_FILTERS: ScreenFilters = {
  ...SHORT_TERM_FILTERS,
  minPremium: 0.05,
  maxPremium: 25,
  minDte: 120,
  maxDte: 800,
  minAbsDelta: 0.1,
  maxAbsDelta: 0.5,
  minVolume: 0,
};

/** Standard price and IV shocks for the scenario grid. */
export const PRICE_SHOCKS = [-0.15, -0.1, -0.05, -0.02, 0, 0.02, 0.05];
export const IV_SHOCKS = [-10, 0, 5, 10, 20];

export const PUT_HUNTER_UNDERLYINGS = ['SPY', 'QQQ', 'IWM', 'DIA'] as const;

/**
 * Dividend-yield estimates used by the pricing model (continuous yield,
 * decimal). Approximate trailing yields — the model's biggest simplification
 * for ETFs that pay quarterly cash dividends. Unknown tickers use 0.
 */
export const DIVIDEND_YIELD_ESTIMATE: Record<string, number> = {
  SPY: 0.012,
  QQQ: 0.006,
  IWM: 0.012,
  DIA: 0.016,
  XLF: 0.015,
  KRE: 0.03,
};

/** Fallback risk-free rate when no Treasury bill yield is available (decimal). */
export const FALLBACK_RISK_FREE = 0.04;
