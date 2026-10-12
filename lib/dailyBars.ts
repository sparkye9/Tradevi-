/**
 * One place to get daily futures bars, with a fallback chain.
 *
 *   1. Yahoo Finance chart API (primary, keyless, ~15–20 min delayed)
 *   2. Stooq daily CSV (free, keyless, end-of-day) when Yahoo errors or
 *      returns too little history
 *
 * Both are free and unofficial, so either can refuse at any time; trying the
 * second costs one request and keeps the page alive when the first is
 * rate-limited. The source actually used travels with the bars so the UI can
 * say where a row came from.
 */
import { fetchYahooCandles, type YFCandle } from './yahooChart';
import { fetchStooqDaily } from './stooq';
import type { UniverseInstrument } from './marketUniverse';

export type BarSource = 'yahoo_delayed' | 'stooq_eod';

export const BAR_SOURCE_LABEL: Record<BarSource, string> = {
  yahoo_delayed: 'Yahoo (delayed)',
  stooq_eod: 'Stooq (end of day)',
};

export interface DailyBars {
  candles: YFCandle[];
  source: BarSource;
  /** Why the primary source was not used, when a fallback answered. */
  fallbackReason?: string;
}

/** Minimum bars worth computing on (computeSelector needs 60 completed sessions). */
const MIN_BARS = 70;

/**
 * Daily bars for one instrument, Yahoo first then Stooq. Throws only when
 * every configured source failed; the message names what each one said.
 */
export async function fetchDailyBars(inst: UniverseInstrument, period = '2y'): Promise<DailyBars> {
  const problems: string[] = [];

  try {
    const { candles } = await fetchYahooCandles(inst.yahoo, period, '1d');
    if (candles.length >= MIN_BARS) return { candles, source: 'yahoo_delayed' };
    problems.push(`Yahoo returned only ${candles.length} daily bars`);
  } catch (e) {
    problems.push(`Yahoo: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (inst.stooq) {
    try {
      const { candles } = await fetchStooqDaily(inst.stooq);
      // Stooq ships full history; trim to roughly the requested window.
      const years = period === '1y' ? 1 : period === '5y' ? 5 : 2;
      const cutoff = Math.floor(Date.now() / 1000) - years * 366 * 86400;
      const windowed = candles.filter((c) => c.time >= cutoff);
      const use = windowed.length >= MIN_BARS ? windowed : candles;
      if (use.length >= MIN_BARS) {
        return { candles: use, source: 'stooq_eod', fallbackReason: problems[0] };
      }
      problems.push(`Stooq returned only ${use.length} daily bars`);
    } catch (e) {
      problems.push(`Stooq: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    problems.push('no Stooq symbol configured');
  }

  throw new Error(problems.join('; '));
}
