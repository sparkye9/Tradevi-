/**
 * Server-side Finnhub API client for Next.js API routes.
 * Uses FINNHUB_API_KEY (no NEXT_PUBLIC prefix — server-only).
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function getKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY is not set — add it to your Vercel environment variables');
  return key;
}

async function finnhubGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getKey();
  const url = new URL(`${FINNHUB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { 'X-Finnhub-Token': key },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Finnhub ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ── Resolution mapping ────────────────────────────────────────────────────────
const INTERVAL_TO_RES: Record<string, string> = {
  '1m': '1', '2m': '2', '5m': '5', '15m': '15', '30m': '30',
  '60m': '60', '1h': '60', '1d': 'D', '5d': 'D', '1wk': 'W', '1mo': 'M',
};

const PERIOD_TO_DAYS: Record<string, number> = {
  '1d': 1, '5d': 5, '1mo': 30, '3mo': 90,
  '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
};

export interface FinnhubCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchFinnhubCandles(
  symbol: string,
  period = '3mo',
  interval = '1d',
): Promise<{ candles: FinnhubCandle[]; dataSource: 'finnhub_realtime' }> {
  const resolution = INTERVAL_TO_RES[interval] ?? 'D';
  const days = PERIOD_TO_DAYS[period] ?? 90;
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  const data = await finnhubGet<{
    s: string; t?: number[]; o?: number[]; h?: number[];
    l?: number[]; c?: number[]; v?: number[];
  }>('/stock/candle', {
    symbol: symbol.toUpperCase(),
    resolution,
    from: String(from),
    to: String(to),
  });

  if (data.s !== 'ok' || !data.t?.length) {
    throw new Error(`No candle data returned for ${symbol} (Finnhub status: ${data.s})`);
  }

  const candles: FinnhubCandle[] = data.t!.map((ts, i) => ({
    time:   ts,
    open:   data.o![i],
    high:   data.h![i],
    low:    data.l![i],
    close:  data.c![i],
    volume: data.v![i],
  }));

  return { candles, dataSource: 'finnhub_realtime' };
}

export interface FinnhubQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  dataSource: 'finnhub_realtime';
  fetchedAt: string;
}

export async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote> {
  const data = await finnhubGet<{
    c: number; o: number; h: number; l: number; pc: number; t: number;
  }>('/quote', { symbol: symbol.toUpperCase() });

  if (!data.c || data.c === 0) {
    throw new Error(`No price data for ${symbol} from Finnhub — check the symbol or API key`);
  }

  return {
    symbol,
    price:         data.c,
    open:          data.o,
    high:          data.h,
    low:           data.l,
    prevClose:     data.pc,
    change:        data.c - data.pc,
    changePercent: data.pc ? ((data.c - data.pc) / data.pc) * 100 : 0,
    dataSource:    'finnhub_realtime',
    fetchedAt:     new Date().toISOString(),
  };
}
