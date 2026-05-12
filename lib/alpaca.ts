/**
 * Alpaca market data API client — backup provider for quotes, candles, and options.
 * Server-side only. Never imported from browser code.
 */

import type { CandleData } from './types';

const ALPACA_BASE = process.env.ALPACA_BASE_URL?.replace(/\/$/, '') ?? 'https://data.alpaca.markets';

function getHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY and ALPACA_SECRET_KEY are not set');
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
    'Accept': 'application/json',
  };
}

async function alpacaGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${ALPACA_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: getHeaders(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Alpaca ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

export interface AlpacaQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;
  dataSource: 'alpaca';
  fetchedAt: string;
}

export async function fetchAlpacaQuote(symbol: string): Promise<AlpacaQuote> {
  const data = await alpacaGet<{ symbol: string; minute_bar?: any; day_bar?: any; prev_day_bar?: any; updated_at?: string }>(
    `/v2/stocks/${encodeURIComponent(symbol)}/quotes`
  );

  // Alpaca provides bars, not traditional quotes. Use latest minute bar for current price
  const latestBar = data.minute_bar || data.day_bar;
  if (!latestBar) {
    throw new Error(`No quote data for ${symbol} from Alpaca`);
  }

  const price = parseFloat(latestBar.c) || 0;
  const open = parseFloat(latestBar.o) || 0;
  const high = parseFloat(latestBar.h) || 0;
  const low = parseFloat(latestBar.l) || 0;
  const volume = parseFloat(latestBar.v) || 0;

  // Get previous close from prev_day_bar if available
  const prevClose = data.prev_day_bar ? parseFloat(data.prev_day_bar.c) || price : price;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    price,
    open,
    high,
    low,
    prevClose,
    change,
    changePercent,
    volume,
    dataSource: 'alpaca',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Candles ──────────────────────────────────────────────────────────────────

const ALPACA_TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1Min',
  '2m': '2Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '60m': '1Hour',
  '1h': '1Hour',
  '1d': '1Day',
  '5d': '1Day', // Alpaca doesn't have 5-day bars, use daily
  '1wk': '1Week',
  '1mo': '1Month',
};

function getAlpacaTimeframe(interval: string): string {
  return ALPACA_TIMEFRAME_MAP[interval] ?? '1Day';
}

function getStartDate(period: string): string {
  const now = new Date();
  const periods: Record<string, () => Date> = {
    '1d': () => new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    '5d': () => new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    '1mo': () => new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    '3mo': () => new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    '6mo': () => new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
    '1y': () => new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
    '2y': () => new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000),
    '5y': () => new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000),
  };
  return (periods[period] || periods['3mo'])().toISOString().split('T')[0];
}

export interface AlpacaChartResult {
  candles: CandleData[];
  dataSource: 'alpaca';
}

export async function fetchAlpacaCandles(
  symbol: string,
  period = '3mo',
  interval = '1d'
): Promise<AlpacaChartResult> {
  const timeframe = getAlpacaTimeframe(interval);
  const start = getStartDate(period);

  const data = await alpacaGet<{
    bars: Array<{
      t: string; // timestamp
      o: number; // open
      h: number; // high
      l: number; // low
      c: number; // close
      v: number; // volume
    }>;
    symbol: string;
    next_page_token?: string;
  }>(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
    timeframe,
    start,
    limit: '5000',
  });

  if (!data.bars || !Array.isArray(data.bars)) {
    throw new Error(`No candle data for ${symbol} from Alpaca`);
  }

  const candles: CandleData[] = data.bars
    .map(bar => ({
      time: Math.floor(new Date(bar.t).getTime() / 1000),
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }))
    .sort((a, b) => a.time - b.time)
    .filter(c => c.open > 0 && c.close > 0);

  if (!candles.length) {
    throw new Error(`No valid candle data for ${symbol} from Alpaca`);
  }

  return { candles, dataSource: 'alpaca' };
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AlpacaOptionsResult {
  expirationDates: string[];
  calls: any[];
  puts: any[];
  underlyingPrice: number;
  dataSource: 'alpaca';
}

export async function fetchAlpacaOptions(
  symbol: string,
  expirationDate?: string | number
): Promise<AlpacaOptionsResult> {
  const params: Record<string, string> = {
    underlying_symbol: symbol.toUpperCase(),
    limit: '500',
  };

  if (expirationDate) {
    const dateString = typeof expirationDate === 'number'
      ? new Date(expirationDate * 1000).toISOString().split('T')[0]
      : expirationDate;
    params.expiration_date = dateString;
  }

  const data = await alpacaGet<{
    chains: Array<{
      symbol: string;
      expiration_date: string;
      calls: any[];
      puts: any[];
      underlying_price: number;
    }>;
  }>(`/v2/options/chains`, params);

  if (!data.chains || !Array.isArray(data.chains) || !data.chains.length) {
    throw new Error(`No options data for ${symbol} from Alpaca`);
  }

  const chain = data.chains[0];
  const expirationDates = data.chains.map(c => c.expiration_date);

  // Parse contracts
  const parseContract = (item: any, type: 'call' | 'put') => ({
    contractSymbol: item.symbol ?? '',
    strike: parseFloat(item.strike_price ?? 0),
    expiration: item.expiration_date ?? '',
    type,
    bid: parseFloat(item.bid_price ?? 0),
    ask: parseFloat(item.ask_price ?? 0),
    mid: parseFloat(item.mid_price ?? (item.bid_price + item.ask_price) / 2),
    lastPrice: parseFloat(item.last_trade_price ?? 0),
    volume: parseInt(item.volume ?? 0),
    openInterest: parseInt(item.open_interest ?? 0),
    impliedVolatility: parseFloat(item.implied_volatility ?? 0),
    delta: parseFloat(item.delta ?? 0),
    gamma: parseFloat(item.gamma ?? 0),
    theta: parseFloat(item.theta ?? 0),
    bidAskSpread: parseFloat(item.ask_price ?? 0) - parseFloat(item.bid_price ?? 0),
    inTheMoney: Boolean(item.in_the_money ?? false),
    moneyness: parseFloat(item.moneyness ?? 0),
    costPerContract: parseFloat(item.ask_price ?? 0) * 100,
    estimatedGainPercent: null,
    dte: Math.max(0, Math.ceil((new Date(item.expiration_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
  });

  const calls = (chain.calls ?? []).map(item => parseContract(item, 'call'));
  const puts = (chain.puts ?? []).map(item => parseContract(item, 'put'));

  return {
    expirationDates,
    calls,
    puts,
    underlyingPrice: parseFloat(chain.underlying_price ?? 0),
    dataSource: 'alpaca',
  };
}