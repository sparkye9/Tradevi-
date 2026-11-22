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
  /**
   * Optional absolute spread allowance in $/share. When set, a contract
   * passes the spread check if EITHER the % spread or the $ spread is within
   * limits (a one-cent tick on a $0.10 option is already 10%).
   */
  maxSpreadAbs?: number;
  /**
   * When true, open interest, volume and spread below these limits mark the
   * row "Thin" (a visible warning) instead of hiding it. Only a missing or
   * zero bid still removes a contract. Used by all Put Hunter presets since
   * Nov 2026, so a falling market is not filtered down to nothing.
   */
  softLiquidity?: boolean;
}

/**
 * The original screening limits. Historical research (strategies, replay
 * funnels) keeps using these so published track records don't change when
 * the live Put Hunter defaults are widened.
 */
/** Filter fields that hold numbers (everything but the softLiquidity switch). */
export type NumericFilterKey = Exclude<keyof ScreenFilters, 'softLiquidity'>;

export const RESEARCH_SHORT_FILTERS: ScreenFilters = {
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
export const RESEARCH_LONG_FILTERS: ScreenFilters = { ...RESEARCH_SHORT_FILTERS, maxPremium: 3, minDte: 60, maxDte: 120 };
export const RESEARCH_LEAPS_FILTERS: ScreenFilters = { ...RESEARCH_SHORT_FILTERS, maxPremium: 25, minDte: 120, maxDte: 800, minAbsDelta: 0.1, maxAbsDelta: 0.5, minVolume: 0 };

// Nov 2026: widened so a market that is already falling still shows puts.
// The old $0.50 cap with a 0.10 delta floor could not both be met with the VIX
// in the 30s. Thin trading is flagged, not hidden (softLiquidity).
export const SHORT_TERM_FILTERS: ScreenFilters = {
  minPremium: 0.05,
  maxPremium: 10,
  minDte: 3,
  maxDte: 60,
  minAbsDelta: 0.03,
  maxAbsDelta: 0.4,
  minOpenInterest: 50,
  minVolume: 1,
  maxSpreadPct: 0.3,
  maxSpreadAbs: 0.05,
  maxGreeksAgeMin: 90,
  softLiquidity: true,
};

export const LONG_TERM_FILTERS: ScreenFilters = {
  ...SHORT_TERM_FILTERS,
  minPremium: 0.05,
  maxPremium: 25,
  minDte: 60,
  maxDte: 120,
  minVolume: 0,
};

/** LEAPS window for the long-term Setups view (no premium cap by default). */
export const LEAPS_FILTERS: ScreenFilters = {
  ...SHORT_TERM_FILTERS,
  minPremium: 0.05,
  maxPremium: 25,
  minDte: 120,
  maxDte: 800,
  minAbsDelta: 0.03,
  maxAbsDelta: 0.5,
  minVolume: 0,
};

/**
 * Cheap tail puts: far out-of-the-money puts that cost little and can
 * multiply when fear spikes. Most expire worthless; the scan ranks by payoff
 * multiple in a stress scenario, never by chance of winning.
 */
/**
 * Small account (Nov 2026): funds scanned for puts a $25–$50 budget can buy.
 * Cheaper sector and bond funds have puts much closer to today's price than
 * SPY at the same dollar cost.
 */
export const SMALL_ACCOUNT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'HYG', 'EEM', 'XLE'] as const;
export function smallAccountFilters(budget: number): ScreenFilters {
  return {
    minPremium: 0.03,
    maxPremium: budget / 100,
    minDte: 3,
    maxDte: 120,
    minAbsDelta: 0.003,
    maxAbsDelta: 0.5,
    minOpenInterest: 100,
    minVolume: 0,
    maxSpreadPct: 0.4,
    maxSpreadAbs: 0.05,
    maxGreeksAgeMin: 90,
    softLiquidity: true,
  };
}

export const TAIL_FILTERS: ScreenFilters = {
  minPremium: 0.05,
  maxPremium: 1,
  minDte: 3,
  maxDte: 60,
  minAbsDelta: 0.003,
  maxAbsDelta: 0.15,
  minOpenInterest: 250,
  minVolume: 1,
  maxSpreadPct: 0.4,
  maxSpreadAbs: 0.03,
  maxGreeksAgeMin: 90,
  softLiquidity: true,
};

/** Stress scenarios for tail puts: index drop with a matching VIX-point rise, valued after TAIL_HOLD_DAYS. */
export const TAIL_SHOCKS: { price: number; ivPts: number }[] = [
  { price: -0.03, ivPts: 5 },
  { price: -0.05, ivPts: 10 },
  { price: -0.08, ivPts: 15 },
];
/** Index of the headline scenario in TAIL_SHOCKS (5% drop, +10 vol points). */
export const TAIL_HEADLINE = 1;
export const TAIL_HOLD_DAYS = 3;

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
