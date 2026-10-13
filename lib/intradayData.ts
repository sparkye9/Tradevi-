/**
 * Multi-timeframe bar fetch with per-timeframe freshness. Every series is
 * Yahoo's continuous front-month future (delayed), stamped at bar open.
 * Forming bars are dropped so structure does not repaint.
 */
import { fetchYahooCandles, type YFCandle } from './yahooChart';
import { dropFormingBar, resampleSessionHours, type TfKey } from './structure';
import { marketClock } from './powerHour';

export const TF_SECONDS: Record<TfKey, number> = { '1D': 86400, '4H': 4 * 3600, '1H': 3600, '15m': 900, '5m': 300, '1m': 60 };

/** Max minutes between the newest CLOSED bar's close and now, while Globex is open. */
export const TF_MAX_AGE_MIN: Record<TfKey, number> = { '1D': 36 * 60, '4H': 6 * 60, '1H': 100, '15m': 40, '5m': 25, '1m': 20 };

export interface SeriesInfo {
  tf: TfKey;
  bars: YFCandle[];
  source: string;
  newestClose: string | null;
  ageMinutes: number | null;
  state: 'fresh' | 'stale' | 'closed' | 'missing';
  error?: string;
}

export function seriesState(tf: TfKey, bars: YFCandle[], now: Date): Pick<SeriesInfo, 'newestClose' | 'ageMinutes' | 'state'> {
  if (!bars.length) return { newestClose: null, ageMinutes: null, state: 'missing' };
  const closeSec = bars[bars.length - 1].time + TF_SECONDS[tf];
  const age = Math.max(0, Math.round((now.getTime() / 1000 - closeSec) / 60));
  const open = marketClock(now).tradesOpen;
  return {
    newestClose: new Date(closeSec * 1000).toISOString(),
    ageMinutes: age,
    state: !open ? 'closed' : age > TF_MAX_AGE_MIN[tf] ? 'stale' : 'fresh',
  };
}

export async function fetchMultiTimeframe(yahooSymbol: string, now = new Date(), want: TfKey[] = ['1D', '4H', '1H', '15m', '5m', '1m']): Promise<Record<TfKey, SeriesInfo | undefined>> {
  const needHourly = want.includes('1H') || want.includes('4H');
  const [daily, hourly, m15, m5, m1] = await Promise.all([
    want.includes('1D') ? fetchYahooCandles(yahooSymbol, '1y', '1d').then((r) => r.candles).catch((e: Error) => e) : null,
    needHourly ? fetchYahooCandles(yahooSymbol, '3mo', '1h').then((r) => r.candles).catch((e: Error) => e) : null,
    want.includes('15m') ? fetchYahooCandles(yahooSymbol, '1mo', '15m').then((r) => r.candles).catch((e: Error) => e) : null,
    want.includes('5m') ? fetchYahooCandles(yahooSymbol, '10d', '5m').then((r) => r.candles).catch((e: Error) => e) : null,
    want.includes('1m') ? fetchYahooCandles(yahooSymbol, '5d', '1m').then((r) => r.candles).catch((e: Error) => e) : null,
  ]);
  const out: Record<TfKey, SeriesInfo | undefined> = { '1D': undefined, '4H': undefined, '1H': undefined, '15m': undefined, '5m': undefined, '1m': undefined };
  const put = (tf: TfKey, raw: YFCandle[] | Error | null, transform?: (b: YFCandle[]) => YFCandle[]) => {
    if (raw == null) return;
    if (raw instanceof Error) {
      out[tf] = { tf, bars: [], source: 'Yahoo Finance (delayed)', newestClose: null, ageMinutes: null, state: 'missing', error: raw.message };
      return;
    }
    const base = transform ? transform(raw) : raw;
    // Daily bars: Yahoo stamps futures dailies at the session's calendar date; treat the
    // current one as forming until 17:00 ET via the 1-day interval check.
    const bars = dropFormingBar(base, TF_SECONDS[tf], now);
    out[tf] = { tf, bars, source: tf === '4H' ? 'Yahoo 1h → 4H (18:00 ET anchored)' : 'Yahoo Finance (delayed)', ...seriesState(tf, bars, now) };
  };
  put('1D', daily);
  if (want.includes('1H')) put('1H', hourly);
  if (want.includes('4H')) put('4H', hourly, (b) => resampleSessionHours(b, 4) as YFCandle[]);
  put('15m', m15);
  put('5m', m5);
  put('1m', m1);
  return out;
}
