/**
 * Twelve Data API client — primary OHLC + indicator provider.
 * Server-side only. Uses Next.js 30-second data cache to respect rate limits.
 * Never imported from browser code.
 */

import type { CandleData } from './types';

const TD_BASE = 'https://api.twelvedata.com';

// Twelve Data interval identifiers
const INTERVAL_MAP: Record<string, string> = {
  '1m':  '1min',
  '2m':  '2min',
  '5m':  '5min',
  '15m': '15min',
  '30m': '30min',
  '60m': '1h',
  '1h':  '1h',
  '1d':  '1day',
  '5d':  '1week', // no 5-day bar in TD; 1week is the closest
  '1wk': '1week',
  '1mo': '1month',
};

// Intervals that support VWAP (session-based; daily/weekly do not apply)
const INTRADAY = new Set(['1min', '2min', '5min', '15min', '30min', '1h']);

function getOutputsize(period: string, tdInterval: string): number {
  if (INTRADAY.has(tdInterval)) {
    // Intraday: bars per day × trading days in period
    const bpd: Record<string, number> = {
      '1min': 390, '2min': 195, '5min': 78, '15min': 26, '30min': 13, '1h': 7,
    };
    const tradingDays: Record<string, number> = {
      '1d': 1, '5d': 5, '1mo': 22, '3mo': 65, '6mo': 130, '1y': 252, '2y': 504, '5y': 1260,
    };
    return Math.min(5000, Math.ceil((bpd[tdInterval] ?? 78) * (tradingDays[period] ?? 65) * 1.1));
  }
  // Daily / weekly / monthly
  const map: Record<string, number> = {
    '1d': 10, '5d': 10, '1mo': 35, '3mo': 95,
    '6mo': 185, '1y': 260, '2y': 520, '5y': 1300,
  };
  return map[period] ?? 100;
}

function getKey(): string {
  const k = process.env.TWELVE_DATA_API_KEY;
  if (!k) throw new Error('TWELVE_DATA_API_KEY is not set');
  return k;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tdGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${TD_BASE}${path}`);
  url.searchParams.set('apikey', getKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // 30-second server-side cache via Next.js Data Cache
  const res = await fetch(url.toString(), { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Twelve Data ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.status === 'error') {
    throw new Error(`Twelve Data: ${json.message ?? 'API error'}`);
  }
  return json;
}

// Convert TD datetime string to Unix timestamp (seconds)
function parseTs(dt: string): number {
  // "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
  const iso = dt.length === 10 ? `${dt}T00:00:00Z` : `${dt.replace(' ', 'T')}Z`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

// Align a TD indicator series to candle datetimes; returns null for missing bars
function align(
  datetimes: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any[],
  key: string,
): (number | null)[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const n = parseFloat(v[key]);
    if (!isNaN(n)) map.set(v.datetime, n);
  }
  return datetimes.map(dt => map.get(dt) ?? null);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TDIndicators {
  rsi:        (number | null)[];
  ema20:      (number | null)[];
  ema50:      (number | null)[];
  macdLine:   (number | null)[];
  macdSignal: (number | null)[];
  macdHist:   (number | null)[];
  vwap:       (number | null)[];
}

export interface TDChartResult {
  candles:      CandleData[];
  tdIndicators: TDIndicators;
  dataSource:   'twelve_data';
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchTwelveChart(
  symbol: string,
  period = '3mo',
  interval = '1d',
): Promise<TDChartResult> {
  const tdInterval = INTERVAL_MAP[interval] ?? '1day';
  const isIntraday = INTRADAY.has(tdInterval);
  const size = String(getOutputsize(period, tdInterval));

  const base: Record<string, string> = {
    symbol:     symbol.toUpperCase(),
    interval:   tdInterval,
    outputsize: size,
    order:      'ASC',
  };

  // Fetch candles + all indicators in parallel.
  // Indicators use Promise.allSettled so a single failing indicator
  // (e.g., VWAP on daily, insufficient data for EMA50) doesn't abort the request.
  const [
    candlesJson,
    rsiSettled, ema20Settled, ema50Settled,
    macdSettled, vwapSettled,
  ] = await Promise.all([
    tdGet('/time_series', base),
    ...await Promise.allSettled([
      tdGet('/rsi',  { ...base, time_period: '14' }),
      tdGet('/ema',  { ...base, time_period: '20' }),
      tdGet('/ema',  { ...base, time_period: '50' }),
      tdGet('/macd', { ...base, fast_period: '12', slow_period: '26', signal_period: '9' }),
      isIntraday ? tdGet('/vwap', base) : Promise.resolve({ values: [] }),
    ]),
  ]);

  // Candles are mandatory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleVals: any[] = candlesJson?.values ?? [];
  if (!candleVals.length) {
    throw new Error(`No candle data for ${symbol} from Twelve Data`);
  }

  const candles: CandleData[] = candleVals
    .map(v => ({
      time:   parseTs(v.datetime),
      open:   parseFloat(v.open)   || 0,
      high:   parseFloat(v.high)   || 0,
      low:    parseFloat(v.low)    || 0,
      close:  parseFloat(v.close)  || 0,
      volume: parseFloat(v.volume) || 0,
    }))
    .filter(c => c.open > 0 && c.close > 0);

  const dts: string[] = candleVals.map(v => v.datetime);

  // Safely extract indicator values (empty array if that indicator failed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vals = (r: PromiseSettledResult<any>): any[] =>
    r.status === 'fulfilled' ? (r.value?.values ?? []) : [];

  const tdIndicators: TDIndicators = {
    rsi:        align(dts, vals(rsiSettled),   'rsi'),
    ema20:      align(dts, vals(ema20Settled), 'ema'),
    ema50:      align(dts, vals(ema50Settled), 'ema'),
    macdLine:   align(dts, vals(macdSettled),  'macd'),
    macdSignal: align(dts, vals(macdSettled),  'macd_signal'),
    macdHist:   align(dts, vals(macdSettled),  'macd_hist'),
    vwap:       isIntraday
      ? align(dts, vals(vwapSettled), 'vwap')
      : new Array(dts.length).fill(null),
  };

  return { candles, tdIndicators, dataSource: 'twelve_data' };
}
