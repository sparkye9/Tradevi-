/**
 * The futures universe, in one place. Add or remove a row here and both the
 * Market Selector and the Futures readiness board pick it up — no code
 * changes elsewhere.
 *
 * `rollWindows` lists the calendar windows (months + day-of-month range) in
 * which the front contract usually rolls on Yahoo's continuous "=F" series.
 * A daily gap bigger than 3 × ATR14 inside one of those windows is flagged as
 * a contract-roll artefact rather than a real move.
 */
export interface RollWindow {
  /** Calendar months (1–12) the roll happens in. */
  months: number[];
  /** Inclusive day-of-month range of the roll week. */
  dayFrom: number;
  dayTo: number;
}

export interface UniverseInstrument {
  /** Short symbol shown in the UI and used in API responses (e.g. "NQ"). */
  symbol: string;
  /** Plain-English name. */
  display: string;
  /** Yahoo Finance continuous-contract ticker. */
  yahoo: string;
  /** What to actually trade (micro / full). */
  tradeAs: string;
  /** Instrument key the readiness engine (lib/trendBias.ts) is keyed by. */
  readinessInstrument: string;
  /** Aliases that should resolve to the same readiness stack (API convenience). */
  aliases: string[];
  /** TradingView continuous symbol for the "Confirm on TradingView" button. */
  tv: string;
  rollWindows: RollWindow[];
}

const QUARTERLY: RollWindow[] = [{ months: [3, 6, 9, 12], dayFrom: 8, dayTo: 21 }];

export const MARKET_UNIVERSE: UniverseInstrument[] = [
  { symbol: 'NQ', display: 'Nasdaq 100', yahoo: 'NQ=F', tradeAs: 'MNQ / NQ', readinessInstrument: 'MNQ', aliases: ['NQ'], tv: 'MNQ1!', rollWindows: QUARTERLY },
  { symbol: 'ES', display: 'S&P 500', yahoo: 'ES=F', tradeAs: 'MES / ES', readinessInstrument: 'MES', aliases: ['ES'], tv: 'MES1!', rollWindows: QUARTERLY },
  { symbol: 'YM', display: 'Dow', yahoo: 'YM=F', tradeAs: 'MYM / YM', readinessInstrument: 'MYM', aliases: ['YM'], tv: 'MYM1!', rollWindows: QUARTERLY },
  { symbol: 'RTY', display: 'Russell 2000', yahoo: 'RTY=F', tradeAs: 'M2K / RTY', readinessInstrument: 'M2K', aliases: ['RTY'], tv: 'M2K1!', rollWindows: QUARTERLY },
  { symbol: 'GC', display: 'Gold', yahoo: 'GC=F', tradeAs: 'MGC / GC', readinessInstrument: 'GC', aliases: ['MGC'], tv: 'GC1!', rollWindows: [{ months: [1, 3, 5, 7, 9, 11], dayFrom: 24, dayTo: 31 }] },
  { symbol: 'SI', display: 'Silver', yahoo: 'SI=F', tradeAs: 'SIL / SI', readinessInstrument: 'SI', aliases: ['SIL'], tv: 'SI1!', rollWindows: [{ months: [2, 4, 6, 8, 11], dayFrom: 24, dayTo: 31 }] },
  { symbol: 'CL', display: 'Crude Oil', yahoo: 'CL=F', tradeAs: 'MCL / CL', readinessInstrument: 'CL', aliases: ['MCL'], tv: 'CL1!', rollWindows: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dayFrom: 15, dayTo: 23 }] },
  { symbol: 'NG', display: 'Natural Gas', yahoo: 'NG=F', tradeAs: 'QG / NG', readinessInstrument: 'NG', aliases: ['QG'], tv: 'NG1!', rollWindows: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dayFrom: 24, dayTo: 31 }] },
  { symbol: '6E', display: 'Euro FX', yahoo: '6E=F', tradeAs: 'M6E / 6E', readinessInstrument: '6E', aliases: ['M6E', 'EUR'], tv: '6E1!', rollWindows: QUARTERLY },
  { symbol: 'ZN', display: '10Y Note', yahoo: 'ZN=F', tradeAs: 'ZN (no micro)', readinessInstrument: 'ZN', aliases: [], tv: 'ZN1!', rollWindows: [{ months: [2, 5, 8, 11], dayFrom: 22, dayTo: 31 }] },
];

export function universeBySymbol(symbol: string): UniverseInstrument | undefined {
  const s = symbol.toUpperCase();
  return MARKET_UNIVERSE.find(
    (u) => u.symbol === s || u.readinessInstrument === s || u.aliases.includes(s) || u.yahoo === s,
  );
}

/** True when a New York calendar date falls inside one of the instrument's roll windows. */
export function inRollWindow(inst: UniverseInstrument, ymd: string): boolean {
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return inst.rollWindows.some((w) => w.months.includes(month) && day >= w.dayFrom && day <= w.dayTo);
}
