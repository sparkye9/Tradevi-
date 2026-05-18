/**
 * Massive (api.massive.com) candle/OHLCV data.
 * Massive.com is the rebranded Polygon.io (since Oct 2025).
 * Replaces Yahoo Finance chart. Real-time or near-real-time depending on plan.
 */

const MASSIVE_BASE = 'https://api.massive.com';

const INTERVAL_MAP: Record<string, { multiplier: number; timespan: string }> = {
  '1m':  { multiplier: 1,  timespan: 'minute' },
  '2m':  { multiplier: 2,  timespan: 'minute' },
  '5m':  { multiplier: 5,  timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '30m': { multiplier: 30, timespan: 'minute' },
  '60m': { multiplier: 60, timespan: 'minute' },
  '1h':  { multiplier: 1,  timespan: 'hour' },
  '1d':  { multiplier: 1,  timespan: 'day' },
  '5d':  { multiplier: 5,  timespan: 'day' },
  '1wk': { multiplier: 1,  timespan: 'week' },
  '1mo': { multiplier: 1,  timespan: 'month' },
};

const PERIOD_TO_DAYS: Record<string, number> = {
  '1d': 1, '5d': 5, '1mo': 30, '3mo': 90,
  '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
};

export interface MassiveCandle {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export async function fetchMassiveCandles(
  symbol: string,
  period   = '3mo',
  interval = '1d',
): Promise<{ candles: MassiveCandle[]; dataSource: 'massive' }> {
  const apiKey = process.env.MASSIVE_API_KEY ?? '';
  if (!apiKey) throw new Error('MASSIVE_API_KEY is not configured');

  const { multiplier, timespan } = INTERVAL_MAP[interval] ?? { multiplier: 1, timespan: 'day' };
  const days = PERIOD_TO_DAYS[period] ?? 90;

  const now  = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const fromStr = from.toISOString().split('T')[0];
  const toStr   = now.toISOString().split('T')[0];

  const url = new URL(
    `${MASSIVE_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${fromStr}/${toStr}`
  );
  url.searchParams.set('limit',    '50000');
  url.searchParams.set('adjusted', 'true');
  url.searchParams.set('sort',     'asc');
  url.searchParams.set('apiKey',   apiKey);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Massive API ${res.status} for ${symbol} candles`);

  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = json?.results ?? [];
  if (!results.length) throw new Error(`No candle data for ${symbol} from Massive`);

  const candles: MassiveCandle[] = results
    .map(r => ({
      time:   Math.floor(r.t / 1000),
      open:   r.o,
      high:   r.h,
      low:    r.l,
      close:  r.c,
      volume: r.v,
    }))
    .filter(c => c.open > 0 && c.close > 0);

  if (!candles.length) throw new Error(`No valid candles for ${symbol} from Massive`);

  return { candles, dataSource: 'massive' };
}
