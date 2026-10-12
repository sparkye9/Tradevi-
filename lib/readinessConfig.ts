/**
 * Futures readiness configuration. Edit here, not in the engine.
 *
 * Hard gates (the only things that can force WAIT on their own):
 *   - session window
 *   - news blackout
 *   - data freshness
 * Everything else is scored (see WEIGHTS, totals 100).
 */

export interface TradingWindow {
  /** Minutes after midnight, New York time. start > end wraps midnight. */
  startMinutesEt: number;
  endMinutesEt: number;
  label: string;
}

export interface ManualHighImpactEvent {
  /** ISO timestamp (any zone, e.g. "2026-10-14T12:30:00Z" or "2026-10-14T08:30:00-04:00"). */
  at: string;
  title: string;
}

export const READINESS_CONFIG = {
  /**
   * null = any time Globex is open (Sun 6 PM – Fri 5 PM ET, minus the daily
   * 5–6 PM halt and CME holidays). Set a window to trade one session only,
   * e.g. { startMinutesEt: 8 * 60, endMinutesEt: 12 * 60, label: 'NY AM 8:00–12:00 ET' }.
   */
  tradingWindow: null as TradingWindow | null,

  news: {
    /** Minutes before a high-impact print that count as blackout. */
    beforeMinutes: 30,
    /** Minutes after the print that still count as blackout. */
    afterMinutes: 15,
    /** Only these calendar countries matter for CME futures. */
    countries: ['USD'] as string[],
    /**
     * Manual list used when the Forex Factory feed is unavailable (and always
     * merged in). Keep it short: FOMC, CPI, NFP. Past dates are ignored.
     */
    manualEvents: [] as ManualHighImpactEvent[],
  },

  /** Maximum age of the newest bar before the engine refuses to grade. */
  maxDataAgeMinutes: {
    '15m': 45,
    '1h': 150,
    '1d': 36 * 60,
    '1wk': 8 * 24 * 60,
  } as Record<'15m' | '1h' | '1d' | '1wk', number>,

  /** Scored conditions. Must total 100. */
  weights: {
    dailyDirectional: 12,
    fourHDirectional: 8,
    dailyFourHAligned: 10,
    weeklyAgrees: 10,
    noConflict: 10,
    dailyZone: 15,
    fourHZone: 10,
    invalidation: 10,
    swingDepth: 5,
    rewardToTp1: 10,
  },

  /** Zone band half-width in ATR14 units: inside ±band counts as "at equilibrium". */
  zoneBandAtr: 0.25,
  /** Invalidation further than this many daily ATRs from price is a "wide stop". */
  maxStopAtr: 3,

  grades: {
    A: 75, // READY
    B: 60, // WATCH
  },
};

export type ReadinessWeights = typeof READINESS_CONFIG.weights;
